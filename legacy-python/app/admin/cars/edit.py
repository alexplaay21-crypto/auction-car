"""Правка машины: админ присылает строки вида  поле=значение  (например
price=150000). Поля: name, country, rarity, max_speed, accel (0-100),
power, handling, reliability, price."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.admin.cars.create import CREATE_FIELDS, FIELD_ALIASES, convert_car_field
from app.admin.cars.list import render_car_admin_card
from app.admin.permissions import require_permission
from app.callbacks.admin import AdminCarCallback
from app.core.context import RequestContext
from app.core.exceptions import AppError
from app.keyboards.admin import admin_car_card_keyboard
from app.localization.manager import t
from app.repositories.car import CarRepository
from app.states.admin_cars import AdminCarStates

router = Router(name="admin_cars_edit")


@router.callback_query(AdminCarCallback.filter(F.action == "edit"))
async def on_edit_prompt(
    query: CallbackQuery, callback_data: AdminCarCallback, ctx: RequestContext, state: FSMContext
) -> None:
    if not await require_permission(query, ctx, "cars"):
        return
    await state.set_state(AdminCarStates.waiting_for_edit)
    await state.update_data(admin_car_id=callback_data.car_id)
    if query.message is not None:
        await query.message.answer(t("admin_car_edit_prompt", ctx.language))
    await query.answer()


@router.message(AdminCarStates.waiting_for_edit)
async def on_edit_data(message: Message, ctx: RequestContext, state: FSMContext) -> None:
    data = await state.get_data()
    car_id = data.get("admin_car_id")

    updates: dict = {}
    try:
        for line in (message.text or "").splitlines():
            if not line.strip():
                continue
            field, _, raw = line.partition("=")
            field = FIELD_ALIASES.get(field.strip().lower(), field.strip().lower())
            if field not in CREATE_FIELDS:
                raise ValueError(field)
            updates[field] = convert_car_field(field, raw)
        if not updates or car_id is None:
            raise ValueError("empty")
    except (ValueError, TypeError) as exc:
        raise AppError(t("admin_car_format_invalid", ctx.language)) from exc

    repo = CarRepository(ctx.session)
    await repo.update_fields(car_id, **updates)
    await state.clear()

    car = await repo.get(car_id)
    await ctx.session.refresh(car)
    await message.answer(
        t("admin_car_updated", ctx.language) + "\n\n" + render_car_admin_card(car, ctx.language),
        reply_markup=admin_car_card_keyboard(ctx.language, car),
    )
