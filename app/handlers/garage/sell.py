"""Быстрая продажа машины (кнопка '💰 Продать', раздел 11 ТЗ). Обработчик
переиспользуется отовсюду, где показывается GarageSellCallback — в
частности, сразу после получения машины в аукционе (Auctions)."""
from __future__ import annotations

from aiogram import Router
from aiogram.types import CallbackQuery

from app.callbacks.garage import GarageSellCallback
from app.core.context import RequestContext
from app.localization.manager import t
from app.services.garage.service import GarageService

router = Router(name="garage_sell")


@router.callback_query(GarageSellCallback.filter())
async def on_quick_sell(
    query: CallbackQuery, callback_data: GarageSellCallback, ctx: RequestContext
) -> None:
    from app.handlers.economy.sell_confirm import send_sell_preview

    await query.answer()
    if query.message is not None:
        await send_sell_preview(query.message, ctx, "quick", callback_data.user_car_id)
