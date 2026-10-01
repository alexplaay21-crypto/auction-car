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
    amount = await GarageService(ctx.session).quick_sell(ctx.user, callback_data.user_car_id)
    if query.message is not None:
        await query.message.edit_text(t("sell_success", ctx.language, amount=amount))
    await query.answer()
