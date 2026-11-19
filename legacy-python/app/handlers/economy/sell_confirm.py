"""Продажа машины государству: экран с суммой и подтверждение."""
from __future__ import annotations

from aiogram import Router
from aiogram.types import CallbackQuery
from aiogram.utils.keyboard import InlineKeyboardBuilder

from app.callbacks.garage import SellConfirmCallback
from app.core.context import RequestContext
from app.core.exceptions import AppError
from app.models.car import Car
from app.models.garage import UserCar
from app.services.economy.transactions import EconomyService, get_commission_rate
from app.services.garage.service import GarageService

router = Router(name="economy_sell_confirm")


def _fmt(n: int) -> str:
    return f"{n:,}".replace(",", " ")


async def send_sell_preview(target, ctx: RequestContext, kind: str, user_car_id: int) -> None:
    user_car = await ctx.session.get(UserCar, user_car_id)
    if user_car is None or user_car.user_id != ctx.user.id or user_car.is_sold:
        raise AppError("🔍 Машина не найдена.")
    car = await ctx.session.get(Car, user_car.car_id)
    if kind == "state":
        rate = await get_commission_rate(ctx.session, "commission_sell_state", ctx.user.is_vip)
    else:
        rate = await GarageService(ctx.session)._quick_sell_commission_rate(ctx.user.is_vip)
    amount = round(car.price * (1 - rate))
    fee = car.price - amount

    text = (
        "💰 <b>Продажа государству</b>\n\n"
        f"🚗 {car.name}\n"
        f"💵 Цена: ${_fmt(car.price)}\n"
        f"🏦 Комиссия: {round(rate * 100)}% (−${_fmt(fee)})\n"
        f"✅ Ты получишь: <b>${_fmt(amount)}</b>"
    )
    b = InlineKeyboardBuilder()
    b.button(text="✅ Продать", callback_data=SellConfirmCallback(kind=kind, user_car_id=user_car_id, yes=True))
    b.button(text="❌ Отмена", callback_data=SellConfirmCallback(kind=kind, user_car_id=user_car_id, yes=False))
    b.adjust(2)
    if car.photo_file_id:
        await target.answer_photo(car.photo_file_id, caption=text, reply_markup=b.as_markup(), parse_mode="HTML")
    else:
        await target.answer(text, reply_markup=b.as_markup(), parse_mode="HTML")


@router.callback_query(SellConfirmCallback.filter())
async def on_sell_confirm(query: CallbackQuery, callback_data: SellConfirmCallback, ctx: RequestContext) -> None:
    if query.message is None:
        return
    if not callback_data.yes:
        await query.answer("Отменено")
        await query.message.delete()
        return
    await query.message.edit_reply_markup(reply_markup=None)  # защита от двойного нажатия
    if callback_data.kind == "state":
        amount = await EconomyService(ctx.session).sell_to_state(ctx.user, callback_data.user_car_id)
    else:
        amount = await GarageService(ctx.session).quick_sell(ctx.user, callback_data.user_car_id)
    await query.answer()
    done = f"💰 <b>Продано!</b>\n+${_fmt(amount)}"
    if query.message.photo:
        await query.message.edit_caption(caption=done, parse_mode="HTML")
    else:
        await query.message.edit_text(done, parse_mode="HTML")
