"""Кнопка '➕ Увеличить гараж' — покупка следующего тарифа расширения."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.types import CallbackQuery

from app.callbacks.garage import GarageUpgradeCallback
from app.core.context import RequestContext
from app.localization.manager import t
from app.services.garage.upgrades import GarageUpgradeService

router = Router(name="garage_upgrade")


@router.callback_query(GarageUpgradeCallback.filter(F.action == "buy"))
async def on_garage_upgrade(
    query: CallbackQuery, callback_data: GarageUpgradeCallback, ctx: RequestContext
) -> None:
    new_capacity = await GarageUpgradeService(ctx.session).upgrade(ctx.user)
    await query.answer(t("garage_upgrade_success", ctx.language, capacity=new_capacity), show_alert=True)
