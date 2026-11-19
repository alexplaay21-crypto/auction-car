"""Кнопка '🎁 Ежедневный бонус': выдаёт и сразу открывает контейнер."""
from __future__ import annotations

import datetime as dt

from aiogram import F, Router
from aiogram.types import CallbackQuery

from app.callbacks.profile import ProfileCallback
from app.core.context import RequestContext
from app.localization.manager import t
from app.services.cars.service import CarService
from app.services.garage.service import GARAGE_LOW_TEXT, pop_garage_low
from app.services.profile.service import ProfileService
from app.utils.dates import time_left_parts

router = Router(name="profile_daily_bonus")


@router.callback_query(ProfileCallback.filter(F.action == "daily_bonus"))
async def on_daily_bonus(
    query: CallbackQuery, callback_data: ProfileCallback, ctx: RequestContext
) -> None:
    now = dt.datetime.now(dt.timezone.utc)
    container_name, result = await ProfileService(ctx.session).claim_daily_bonus(ctx.user, now)
    car = result.car
    left = time_left_parts(now)

    text = f"📦 <b>{container_name}</b> открыт!\n\n" + CarService.format_card(car, ctx.language)
    if result.auto_sold_amount is not None:
        text += f"\n\n💸 Гараж полон, машина продана за ${result.auto_sold_amount:,}".replace(",", " ")
    text += f"\n\n⏳ Следующий бонус через: {left['hours']} ч {left['minutes']} мин"

    await query.answer()
    if query.message is None:
        return
    low = pop_garage_low(ctx.session, ctx.user.id)
    if car.photo_file_id:
        await query.message.answer_photo(car.photo_file_id, caption=text)
    else:
        await query.message.answer(text)
    if low:
        await query.message.answer(GARAGE_LOW_TEXT)
