"""Создание машины (раздел 27 ТЗ). Админ присылает одно сообщение (можно с
фото — тогда формат в подписи): 
  название | страна | редкость | макс.скорость | 0-100 | мощность | управляемость | надёжность | стоимость
Редкость: common / rare / epic / mythic. Парсер значений переиспользуется
правкой (edit.py)."""
from __future__ import annotations

from decimal import Decimal, InvalidOperation

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.admin.cars.list import render_car_admin_card
from app.admin.permissions import require_permission
from app.callbacks.admin import AdminCarCallback
from app.core.context import RequestContext
from app.core.enums import Rarity
from app.core.exceptions import AppError
from app.keyboards.admin import admin_car_card_keyboard
from app.localization.manager import t
from app.repositories.car import CarRepository
from app.states.admin_cars import AdminCarStates

router = Router(name="admin_cars_create")

CREATE_FIELDS = (
    "name", "country", "rarity", "max_speed", "accel_0_100",
    "power", "handling", "reliability", "price",
)
FIELD_ALIASES = {"accel": "accel_0_100", "speed": "max_speed"}


def convert_car_field(field: str, raw: str):
    raw = raw.strip()
    if field in ("name", "country"):
        if not raw:
            raise ValueError(field)
        return raw
    if field == "rarity":
        key = raw.strip().lower()
        key = {
            "legendary": "mythic", "легендарная": "mythic", "легендарный": "mythic",
            "обычная": "common", "редкая": "rare", "эпическая": "epic", "эпик": "epic",
        }.get(key, key)
        return Rarity(key)
    if field == "accel_0_100":
        try:
            return Decimal(raw.replace(",", "."))
        except InvalidOperation as exc:
            raise ValueError(field) from exc
    return int(raw)


def parse_car_create(text: str) -> dict:
    parts = [p.strip() for p in text.split("|")]
    if len(parts) != len(CREATE_FIELDS):
        raise ValueError("fields_count")
    return {field: convert_car_field(field, raw) for field, raw in zip(CREATE_FIELDS, parts)}


@router.callback_query(AdminCarCallback.filter(F.action == "create"))
async def on_create_prompt(
    query: CallbackQuery, callback_data: AdminCarCallback, ctx: RequestContext, state: FSMContext
) -> None:
    if not await require_permission(query, ctx, "cars"):
        return
    await state.set_state(AdminCarStates.waiting_for_create)
    if query.message is not None:
        await query.message.answer(t("admin_car_create_prompt", ctx.language))
    await query.answer()


@router.message(AdminCarStates.waiting_for_create)
async def on_create_data(message: Message, ctx: RequestContext, state: FSMContext) -> None:
    text = message.caption if message.photo else message.text
    try:
        fields = parse_car_create(text or "")
    except (ValueError, TypeError) as exc:
        # Состояние сохраняем — админ может просто прислать исправленную строку.
        raise AppError(t("admin_car_format_invalid", ctx.language)) from exc

    if message.photo:
        fields["photo_file_id"] = message.photo[-1].file_id

    car = await CarRepository(ctx.session).create(**fields)
    await ctx.session.flush()
    await state.clear()

    await message.answer(
        t("admin_car_created", ctx.language, car_id=car.id) + "\n\n" + render_car_admin_card(car, ctx.language),
        reply_markup=admin_car_card_keyboard(ctx.language, car),
    )
