"""Один пользователь — не чаще одной команды/апдейта раз в
core.constants.ANTIFLOOD_INTERVAL_SECONDS. Реализовано через Redis
SET NX EX — дёшево, не требует похода в БД."""
from __future__ import annotations

from typing import Any, Awaitable, Callable

from aiogram import BaseMiddleware
from aiogram.types import CallbackQuery, Message, TelegramObject
from redis.exceptions import RedisError

from app.config.logging import get_logger

from app.core.constants import ANTIFLOOD_INTERVAL_SECONDS
from app.database.redis import get_redis
from app.localization.manager import t

logger = get_logger(__name__)


class AntiFloodMiddleware(BaseMiddleware):
    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        tg_user = getattr(event, "from_user", None)
        if tg_user is None:
            return await handler(event, data)

        redis = get_redis()
        key = f"antiflood:{tg_user.id}"
        interval = max(1, round(ANTIFLOOD_INTERVAL_SECONDS))
        try:
            allowed = await redis.set(key, "1", nx=True, ex=interval)
        except RedisError:
            # Redis недоступен — антифлуд не должен класть всего бота.
            logger.warning("antiflood.redis_unavailable")
            return await handler(event, data)

        if not allowed:
            ctx = data.get("ctx")
            language = ctx.language if ctx else None
            text = t("error_flood", language)
            if isinstance(event, CallbackQuery):
                await event.answer(text, show_alert=False)
            # Для обычных Message молча игнорируем повтор — не заваливаем
            # чат сообщениями об антифлуде, как того требует ТЗ (раздел 29).
            return None

        return await handler(event, data)
