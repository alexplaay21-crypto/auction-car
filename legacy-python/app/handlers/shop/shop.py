"""🛒 Магазин — список лотов и покупка (раздел 23 ТЗ)."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.filters.callback_data import CallbackData
from aiogram.utils.keyboard import InlineKeyboardBuilder
from app.repositories.shop import ShopLotItemRepository
from aiogram.types import CallbackQuery, LabeledPrice, Message, PreCheckoutQuery

from app.callbacks.shop import ShopCallback
from app.core.context import RequestContext
from app.keyboards.main_menu import menu_text_variants
from app.keyboards.shop import shop_keyboard
from app.localization.manager import t
from app.services.shop.purchases import ShopPurchaseService
from app.services.containers.auto_open import auto_open_and_notify
from app.services.shop.service import ShopService

router = Router(name="shop_main")


@router.message(F.text.in_(menu_text_variants("menu_shop")))
async def show_shop(message: Message, ctx: RequestContext) -> None:
    lots = await ShopService(ctx.session).list_available()
    if not lots:
        await message.answer(t("shop_empty", ctx.language))
        return

    await message.answer(t("shop_title", ctx.language), reply_markup=shop_keyboard(lots))


class ShopBuyCallback(CallbackData, prefix="shopbuy"):
    lot_id: int


def _fmt(n: int) -> str:
    return f"{n:,}".replace(",", " ")


async def _item_line(ctx, it) -> str:
    from app.models.car import Car
    t = it.item_type.value
    p = it.payload or {}
    q = f" ×{it.quantity}" if it.quantity > 1 else ""
    if t == "money":
        return f"💰 ${_fmt(int(p.get('amount', 0)))}{q}"
    if t == "car":
        car = await ctx.session.get(Car, int(p.get("car_id", 0)))
        return f"🚗 {car.name if car else 'Машина'}{q}"
    if t == "container":
        return f"📦 Контейнер ×{p.get('quantity', 1) * it.quantity}"
    if t == "skill":
        return f"⬆️ Навык{q}"
    if t == "battle_pass":
        return f"🎫 +{p.get('levels', 1)} ур. Battle Pass{q}"
    if t == "vip":
        return "👑 VIP навсегда"
    return "🎁 Бонус"


@router.callback_query(ShopCallback.filter())
async def on_shop_open(query: CallbackQuery, callback_data: ShopCallback, ctx: RequestContext) -> None:
    from html import escape
    service = ShopPurchaseService(ctx.session)
    lot = await service.check_lot(ctx.user, callback_data.lot_id)
    items = await ShopLotItemRepository(ctx.session).list_for_lot(lot.id)
    lines = [f"🛒 <b>{escape(lot.title)}</b>"]
    if lot.description:
        lines += ["", escape(lot.description)]
    if items:
        lines += ["", "📦 <b>Что внутри:</b>"]
        lines += [await _item_line(ctx, it) for it in items]
    lines += ["", f"⭐ Цена: <b>{lot.price} Stars</b>"]
    b = InlineKeyboardBuilder()
    b.button(text=f"⭐ Купить · {lot.price}", callback_data=ShopBuyCallback(lot_id=lot.id))
    await query.answer()
    if query.message is None:
        return
    text = "\n".join(lines)
    if lot.photo_file_id:
        await query.message.answer_photo(lot.photo_file_id, caption=text, reply_markup=b.as_markup(), parse_mode="HTML")
    else:
        await query.message.answer(text, reply_markup=b.as_markup(), parse_mode="HTML")


@router.callback_query(ShopBuyCallback.filter())
async def on_shop_buy(query: CallbackQuery, callback_data: ShopBuyCallback, ctx: RequestContext) -> None:
    lot = await ShopPurchaseService(ctx.session).check_lot(ctx.user, callback_data.lot_id)
    await query.answer()
    if query.message is None:
        return
    await query.message.answer_invoice(
        title=lot.title,
        description=(lot.description or f"Покупка в магазине: {lot.title}")[:250],
        payload=f"shop:{lot.id}",
        currency="XTR",
        prices=[LabeledPrice(label=lot.title, amount=lot.price)],
        provider_token="",
    )


@router.pre_checkout_query(F.invoice_payload.startswith("shop:"))
async def on_shop_pre_checkout(query: PreCheckoutQuery) -> None:
    await query.answer(ok=True)


@router.message(F.successful_payment.invoice_payload.startswith("shop:"))
async def on_shop_paid(message: Message, ctx: RequestContext) -> None:
    payment = message.successful_payment
    lot_id = int(payment.invoice_payload.split(":")[1])
    await ShopPurchaseService(ctx.session).deliver_paid_lot(ctx.user, lot_id, payment.total_amount)
    await auto_open_and_notify(message.bot, ctx.session, ctx.user, message.chat.id)
    await message.answer("✅ Покупка оплачена! Предметы уже у тебя.")
