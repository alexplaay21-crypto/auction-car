"""Обеспечивает наличие User в БД для каждого апдейта, обновляет
username/first_name при изменении, отмечает активность (для сегментации
рассылок active/inactive — раздел 25 ТЗ), проверяет бан, формирует
RequestContext (язык группы и права администратора достраивают
language.py и admin.py дальше по цепочке)."""
from __future__ import annotations

import datetime as dt
from typing import Any, Awaitable, Callable

from aiogram import BaseMiddleware
from aiogram.types import CallbackQuery, Message, TelegramObject
from aiogram.types import User as TgUser

from app.config.settings import settings
from app.core.context import RequestContext
from app.core.enums import Language
from app.localization.manager import t
from app.repositories.user import UserRepository

# Не пишем last_seen_at на каждый апдейт — только если прошло больше этого
# времени с последней отметки. Экономит запись в БД при активном флуде
# сообщений, не теряя точность для сегментации active/inactive.
LAST_SEEN_THROTTLE = dt.timedelta(minutes=5)


def _extract_tg_user(event: TelegramObject) -> TgUser | None:
    if isinstance(event, (Message, CallbackQuery)):
        return event.from_user
    return getattr(event, "from_user", None)


class UserMiddleware(BaseMiddleware):
    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        tg_user = _extract_tg_user(event)
        if tg_user is None or tg_user.is_bot:
            return await handler(event, data)

        session = data["session"]
        repo = UserRepository(session)
        user = await repo.get_or_none(tg_user.id)
        now = dt.datetime.now(dt.timezone.utc)

        if user is None:
            default_language = Language(settings.default_language)
            user = await repo.create(tg_user.id, tg_user.username, tg_user.first_name, default_language)
            await repo.flush()
            await repo.touch_last_seen(user.id, now)
            user.last_seen_at = now
        else:
            if user.username != tg_user.username or user.first_name != tg_user.first_name:
                await repo.update_profile(tg_user.id, tg_user.username, tg_user.first_name)
                user.username = tg_user.username
                user.first_name = tg_user.first_name
            if user.last_seen_at is None or now - user.last_seen_at >= LAST_SEEN_THROTTLE:
                await repo.touch_last_seen(user.id, now)
                user.last_seen_at = now

        if user.is_banned:
            text = t("error_banned", user.language)
            if isinstance(event, CallbackQuery):
                await event.answer(text, show_alert=True)
            elif isinstance(event, Message):
                await event.answer(text)
            return None  # цепочка дальше не идёт — заблокированный игрок

        data["user"] = user
        data["ctx"] = RequestContext(
            session=session, user=user, language=user.language, is_owner=False, is_admin=False,
        )
        return await handler(event, data)
