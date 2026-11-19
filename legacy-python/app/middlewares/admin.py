"""Достраивает RequestContext правами: is_owner / is_admin (через
core.permissions). Выполняется после user.py, чтобы хендлеры и фильтры
админки (app/filters/admin.py, owner.py) могли просто читать ctx.is_admin /
ctx.is_owner, не делая отдельный запрос к БД."""
from __future__ import annotations

from typing import Any, Awaitable, Callable

from aiogram import BaseMiddleware
from aiogram.types import TelegramObject

from app.core.permissions import is_admin, is_owner


class AdminMiddleware(BaseMiddleware):
    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        ctx = data.get("ctx")
        if ctx is not None:
            ctx.is_owner = is_owner(ctx.user.id)
            ctx.is_admin = ctx.is_owner or await is_admin(ctx.session, ctx.user.id)
        return await handler(event, data)
