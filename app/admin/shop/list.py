"""Раздел 'Магазин': список лотов (включая недоступные) и карточка."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery

from app.admin.permissions import require_permission
from app.callbacks.admin import AdminMenuCallback, AdminShopCallback
from app.core.context import RequestContext
from app.core.enums import Language
from app.keyboards.admin import admin_shop_list_keyboard, admin_shop_lot_keyboard
from app.localization.manager import t
from app.models.shop_lot import ShopLot
from app.repositories.shop import ShopLotItemRepository, ShopLotRepository

router = Router(name="admin_shop_list")


async def render_lot_admin_card(ctx: RequestContext, lot: ShopLot) -> str:
    lines = [
        f"🛒 {lot.title} (ID {lot.id})",
        lot.description or "—",
        t("admin_shop_price_line", ctx.language, price=lot.price),
    ]
    if not lot.is_available:
        lines.append(t("admin_shop_disabled_label", ctx.language))

    items = await ShopLotItemRepository(ctx.session).list_for_lot(lot.id)
    lines.append("")
    if not items:
        lines.append(t("admin_shop_no_items", ctx.language))
    for item in items:
        lines.append(
            t("admin_shop_item_line", ctx.language,
              item_id=item.id, type=item.item_type.value, payload=item.payload, quantity=item.quantity)
        )
    return "\n".join(lines)


@router.callback_query(AdminMenuCallback.filter(F.section == "shop"))
async def on_open_shop_section(
    query: CallbackQuery, callback_data: AdminMenuCallback, ctx: RequestContext, state: FSMContext
) -> None:
    if not await require_permission(query, ctx, "shop"):
        return
    await state.clear()
    lots = await ShopLotRepository(ctx.session).list_all()
    title = t("admin_shop_title", ctx.language) if lots else t("admin_shop_empty", ctx.language)
    if query.message is not None:
        await query.message.edit_text(title, reply_markup=admin_shop_list_keyboard(ctx.language, lots))
    await query.answer()


@router.callback_query(AdminShopCallback.filter(F.action == "view"))
async def on_view_lot(query: CallbackQuery, callback_data: AdminShopCallback, ctx: RequestContext) -> None:
    if not await require_permission(query, ctx, "shop"):
        return
    lot = await ShopLotRepository(ctx.session).get(callback_data.lot_id)
    if lot is None:
        await query.answer(t("error_not_found", ctx.language), show_alert=True)
        return
    if query.message is not None:
        await query.message.edit_text(
            await render_lot_admin_card(ctx, lot), reply_markup=admin_shop_lot_keyboard(ctx.language, lot)
        )
    await query.answer()
