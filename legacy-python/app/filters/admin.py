"""Фильтр: апдейт от администратора (владелец проходит всегда). Права уже
посчитаны в middlewares/admin.py и лежат в ctx — здесь без похода в БД."""
from __future__ import annotations

from aiogram.filters import BaseFilter
from aiogram.types import TelegramObject

from app.core.context import RequestContext


class IsAdmin(BaseFilter):
    async def __call__(self, event: TelegramObject, ctx: RequestContext) -> bool:
        return ctx.is_admin
