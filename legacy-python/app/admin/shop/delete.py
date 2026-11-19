"""Включение/выключение доступности лота (is_available) — не физическое
удаление: на лот могут ссылаться уже сделанные Purchase (история)."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.types import CallbackQuery

from app.admin.permissions import require_permission
from app.admin.shop.list import render_lot_admin_card
from app.callbacks.admin import AdminShopCallback
from app.core.context import RequestContext
from app.keyboards.admin import admin_shop_lot_keyboard
from app.localization.manager import t
from app.repositories.shop import ShopLotRepository

router = Router(name="admin_shop_delete")


@router.callback_query(AdminShopCallback.filter(F.action == "toggle"))
async def on_toggle_lot(query: CallbackQuery, callback_data: AdminShopCallback, ctx: RequestContext) -> None:
    if not await require_permission(query, ctx, "shop"):
        return
    repo = ShopLotRepository(ctx.session)
    lot = await repo.get(callback_data.lot_id)
    if lot is None:
        await query.answer(t("error_not_found", ctx.language), show_alert=True)
        return

    available = not lot.is_available
    await repo.update_fields(lot.id, is_available=available)
    lot.is_available = available

    if query.message is not None:
        await query.message.edit_text(
            await render_lot_admin_card(ctx, lot), reply_markup=admin_shop_lot_keyboard(ctx.language, lot)
        )
    await query.answer(t("admin_action_done", ctx.language))
