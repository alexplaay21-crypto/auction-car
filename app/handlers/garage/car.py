"""/car ID — карточка машины из каталога.
Алиасы: car, c (EN), авто, а (RU)."""
from __future__ import annotations

from aiogram import Router
from aiogram.types import Message

from app.core.context import RequestContext
from app.core.exceptions import AppError
from app.filters.command_alias import CommandAlias
from app.localization.manager import t
from app.services.cars.service import CarService

router = Router(name="garage_car")

ALIASES = ("car", "c", "авто", "а")


@router.message(CommandAlias(*ALIASES))
async def cmd_car(message: Message, ctx: RequestContext, command_args: str) -> None:
    car_id_raw = command_args.strip()
    if not car_id_raw.isdigit():
        raise AppError(t("car_id_required", ctx.language))

    car = await CarService(ctx.session).get_car_or_raise(int(car_id_raw), ctx.language)
    await message.answer(CarService.format_card(car, ctx.language))
