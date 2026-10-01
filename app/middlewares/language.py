"""Уточняет язык ответа для конкретного чата: в группе — язык группы
(его задаёт администратор группы через админку), в личных сообщениях —
язык самого пользователя (data['user'].language). Предпочтение
пользователя в БД при этом не меняется — учитывается только отображение
в данном чате."""
from __future__ import annotations

from typing import Any, Awaitable, Callable

from aiogram import BaseMiddleware
from aiogram.types import CallbackQuery, Message, TelegramObject

from app.repositories.group import GroupMemberRepository, GroupRepository


def _extract_chat(event: TelegramObject):
    if isinstance(event, Message):
        return event.chat
    if isinstance(event, CallbackQuery) and event.message is not None:
        return event.message.chat
    return None


class LanguageMiddleware(BaseMiddleware):
    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        ctx = data.get("ctx")
        if ctx is None:
            return await handler(event, data)

        chat = _extract_chat(event)
        if chat is not None and chat.type in ("group", "supergroup"):
            group = await GroupRepository(ctx.session).get(chat.id)
            if group is not None and group.is_active:
                ctx.language = group.language
                # Активность в зарегистрированной группе = участие в ней
                # (нужно для группового топа и допуска к аукциону группы).
                await GroupMemberRepository(ctx.session).ensure_member(chat.id, ctx.user.id)

        return await handler(event, data)
