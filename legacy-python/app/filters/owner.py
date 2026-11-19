"""Фильтр: апдейт от владельца бота (settings.OWNER_ID)."""
from __future__ import annotations

from aiogram.filters import BaseFilter
from aiogram.types import TelegramObject

from app.core.context import RequestContext


class IsOwner(BaseFilter):
    async def __call__(self, event: TelegramObject, ctx: RequestContext) -> bool:
        return ctx.is_owner
