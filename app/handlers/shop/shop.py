"""🛒 Магазин — список лотов и покупка (раздел 23 ТЗ)."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.types import CallbackQuery, Message

from app.callbacks.shop import ShopCallback
from app.core.context import RequestContext
from app.keyboards.main_menu import menu_text_variants
from app.keyboards.shop import shop_keyboard
from app.localization.manager import t
from app.services.shop.purchases import ShopPurchaseService
from app.services.shop.service import ShopService

router = Router(name="shop_main")


@router.message(F.text.in_(menu_text_variants("menu_shop")))
async def show_shop(message: Message, ctx: RequestContext) -> None:
    lots = await ShopService(ctx.session).list_available()
    if not lots:
        await message.answer(t("shop_empty", ctx.language))
        return

    await message.answer(t("shop_title", ctx.language), reply_markup=shop_keyboard(lots))


@router.callback_query(ShopCallback.filter())
async def on_shop_buy(query: CallbackQuery, callback_data: ShopCallback, ctx: RequestContext) -> None:
    await ShopPurchaseService(ctx.session).purchase_lot(ctx.user, callback_data.lot_id)
    if query.message is not None:
        await query.message.answer(t("shop_purchase_success", ctx.language))
    await query.answer()
