"""/sellcar CAR_ID (продать/прод | sellcar/sc) — продажа государству.
/sell CAR_ID PLAYER PRICE (продать/прод | sell/s) — продажа игроку с
офером на принятие/отклонение.

RU-алиас «продать/прод» в ТЗ общий для обеих команд — различаем по
количеству аргументов (1 → государству, 3 → другому игроку)."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message

from app.callbacks.economy import SaleOfferCallback
from app.callbacks.garage import SellPlayerCallback
from app.core.context import RequestContext
from app.core.exceptions import AppError
from app.filters.command_alias import CommandAlias
from app.keyboards.economy import sale_offer_keyboard
from app.localization.manager import t
from app.services.economy.transactions import EconomyService
from app.utils.usernames import format_mention

router = Router(name="economy_sales")

SELLCAR_ALIASES = ("sellcar", "sc", "продать", "прод")
SELL_ALIASES = ("sell", "offer", "предложить", "пред")


async def _resolve_user_car(ctx: RequestContext, car_id: int) -> int:
    from sqlalchemy import select
    from app.models.garage import UserCar

    stmt = (
        select(UserCar.id)
        .where(UserCar.user_id == ctx.user.id, UserCar.car_id == car_id, UserCar.is_sold.is_(False))
        .order_by(UserCar.id)
        .limit(1)
    )
    found = (await ctx.session.execute(stmt)).scalar_one_or_none()
    if found is None:
        raise AppError("🚗 У тебя нет такой машины. Смотри ID в гараже.")
    return found


@router.message(CommandAlias(*SELLCAR_ALIASES))
async def cmd_sellcar(message: Message, ctx: RequestContext, command_args: str) -> None:
    parts = command_args.split()
    if len(parts) != 1 or not parts[0].isdigit():
        raise AppError("Формат: /sellcar ID")
    user_car_id = await _resolve_user_car(ctx, int(parts[0]))
    from app.handlers.economy.sell_confirm import send_sell_preview

    await send_sell_preview(message, ctx, "state", user_car_id)


async def _sell_preview(message, ctx, car_raw, buyer_ref, price_raw) -> None:
    from html import escape

    from aiogram.utils.keyboard import InlineKeyboardBuilder

    from app.callbacks.garage import SellPlayerCallback
    from app.models.car import Car
    from app.models.garage import UserCar
    from app.services.economy.transactions import get_commission_rate, resolve_user_ref

    if not car_raw.isdigit() or not price_raw.isdigit() or int(price_raw) <= 0:
        raise AppError("Формат: /sell ID ИГРОК ЦЕНА")
    user_car_id = await _resolve_user_car(ctx, int(car_raw))
    price = int(price_raw)
    buyer = await resolve_user_ref(ctx.session, buyer_ref, ctx.language)
    if buyer.id == ctx.user.id:
        raise AppError("🙅 Нельзя продать самому себе.")

    user_car = await ctx.session.get(UserCar, user_car_id)
    car = await ctx.session.get(Car, user_car.car_id)
    rate = await get_commission_rate(ctx.session, "commission_sell_player", ctx.user.is_vip)
    income = round(price * (1 - rate))
    fee = price - income
    fmt = lambda n: f"{n:,}".replace(",", " ")
    buyer_name = escape(f"@{buyer.username}" if buyer.username else (buyer.first_name or str(buyer.id)))

    text = (
        "🤝 <b>Продажа игроку</b>\n\n"
        f"🚗 {car.name}\n"
        f"👤 Покупатель: {buyer_name}\n"
        f"💵 Цена: ${fmt(price)}\n"
        f"🏦 Комиссия: {round(rate * 100)}% (−${fmt(fee)})\n"
        f"✅ Ты получишь: <b>${fmt(income)}</b>"
    )
    b = InlineKeyboardBuilder()
    b.button(text="✅ Отправить", callback_data=SellPlayerCallback(user_car_id=user_car_id, buyer_id=buyer.id, price=price, yes=True))
    b.button(text="❌ Отмена", callback_data=SellPlayerCallback(user_car_id=user_car_id, buyer_id=buyer.id, price=price, yes=False))
    b.adjust(2)
    if car.photo_file_id:
        await message.answer_photo(car.photo_file_id, caption=text, reply_markup=b.as_markup(), parse_mode="HTML")
    else:
        await message.answer(text, reply_markup=b.as_markup(), parse_mode="HTML")


class SellStates(StatesGroup):
    car = State()
    buyer = State()
    price = State()


@router.message(CommandAlias(*SELL_ALIASES))
async def cmd_sell(message: Message, ctx: RequestContext, command_args: str, state: FSMContext) -> None:
    parts = command_args.split()
    if not parts:
        await state.set_state(SellStates.car)
        await message.answer("🚗 <b>Продажа игроку</b>\n\nНапиши <b>ID машины</b> из гаража (например 001)\n/cancel — отмена", parse_mode="HTML")
        return
    if len(parts) != 3:
        raise AppError("Формат: /sell ID ИГРОК ЦЕНА")
    await _sell_preview(message, ctx, parts[0], parts[1], parts[2])


@router.message(SellStates.car)
async def sell_step_car(message: Message, ctx: RequestContext, state: FSMContext) -> None:
    raw = (message.text or "").strip()
    if not raw.isdigit():
        await message.answer("✍️ ID машины — число, например 001")
        return
    await _resolve_user_car(ctx, int(raw))
    await state.update_data(car=raw)
    await state.set_state(SellStates.buyer)
    await message.answer("👤 Напиши <b>ник или ID покупателя</b>", parse_mode="HTML")


@router.message(SellStates.buyer)
async def sell_step_buyer(message: Message, ctx: RequestContext, state: FSMContext) -> None:
    from app.services.economy.transactions import resolve_user_ref
    raw = (message.text or "").strip()
    await resolve_user_ref(ctx.session, raw, ctx.language)  # проверка, что игрок есть
    await state.update_data(buyer=raw)
    await state.set_state(SellStates.price)
    await message.answer("💰 Напиши <b>цену</b> (например 50000)", parse_mode="HTML")


@router.message(SellStates.price)
async def sell_step_price(message: Message, ctx: RequestContext, state: FSMContext) -> None:
    raw = (message.text or "").strip().replace(" ", "")
    if not raw.isdigit() or int(raw) <= 0:
        await message.answer("✍️ Цена — положительное число")
        return
    data = await state.get_data()
    await state.clear()
    await _sell_preview(message, ctx, data["car"], data["buyer"], raw)


@router.callback_query(SellPlayerCallback.filter())
async def on_sell_player_confirm(query: CallbackQuery, callback_data: SellPlayerCallback, ctx: RequestContext) -> None:
    if query.message is None:
        return
    if not callback_data.yes:
        await query.answer("Отменено")
        await query.message.delete()
        return
    await query.message.edit_reply_markup(reply_markup=None)  # защита от двойного нажатия
    sale, buyer, car = await EconomyService(ctx.session).offer_sell_to_player(
        ctx.user, callback_data.user_car_id, str(callback_data.buyer_id), callback_data.price
    )
    await query.answer()
    sent = "📨 <b>Предложение отправлено!</b>"
    if query.message.photo:
        await query.message.edit_caption(caption=sent, parse_mode="HTML")
    else:
        await query.message.edit_text(sent, parse_mode="HTML")
    try:
        offer = t("sell_player_offer_received", buyer.language, car_name=car.name,
                  price=f"{callback_data.price:,}".replace(",", " "))
        from app.services.notifications import FOOTER, notif_enabled
        if not await notif_enabled(ctx.session, buyer.id, "offers"):
            return
        offer += FOOTER
        kb = sale_offer_keyboard(buyer.language, sale.id)
        if car.photo_file_id:
            await query.bot.send_photo(buyer.id, car.photo_file_id, caption=offer, reply_markup=kb, parse_mode="HTML")
        else:
            await query.bot.send_message(buyer.id, offer, reply_markup=kb, parse_mode="HTML")
    except Exception:
        pass


@router.callback_query(SaleOfferCallback.filter(F.action == "accept"))
async def on_sale_accept(
    query: CallbackQuery, callback_data: SaleOfferCallback, ctx: RequestContext
) -> None:
    sale, car = await EconomyService(ctx.session).accept_sale_offer(ctx.user, callback_data.sale_id)
    if query.message is not None:
        if query.message.photo:
            await query.message.edit_caption(caption=t("sell_player_accepted", ctx.language))
        else:
            await query.message.edit_text(t("sell_player_accepted", ctx.language))
    await query.answer()

    try:
        from app.repositories.user import UserRepository

        seller = await UserRepository(ctx.session).get(sale.seller_id)
        if seller is not None:
            income = round(sale.price * (1 - sale.commission_rate))
            await query.bot.send_message(
                seller.id,
                f"🎉 <b>Сделка!</b>\n🚗 {car.name} → {format_mention(ctx.user)}\n"
                f"💰 +${income:,}".replace(",", " "),
                parse_mode="HTML",
            )
    except Exception:
        pass


@router.callback_query(SaleOfferCallback.filter(F.action == "decline"))
async def on_sale_decline(
    query: CallbackQuery, callback_data: SaleOfferCallback, ctx: RequestContext
) -> None:
    sale = await EconomyService(ctx.session).decline_sale_offer(ctx.user, callback_data.sale_id)
    if query.message is not None:
        if query.message.photo:
            await query.message.edit_caption(caption=t("sell_player_declined", ctx.language))
        else:
            await query.message.edit_text(t("sell_player_declined", ctx.language))
    await query.answer()

    try:
        from app.repositories.user import UserRepository

        seller = await UserRepository(ctx.session).get(sale.seller_id)
        if seller is not None:
            await query.bot.send_message(seller.id, t("sell_player_declined", seller.language))
    except Exception:
        pass
