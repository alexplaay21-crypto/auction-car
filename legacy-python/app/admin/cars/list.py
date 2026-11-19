"""Раздел 'Машины': список (включая скрытые) и карточка машины."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery

from app.admin.permissions import require_permission
from app.callbacks.admin import AdminCarCallback, AdminMenuCallback
from app.core.context import RequestContext
from app.core.enums import Language
from app.keyboards.admin import admin_car_card_keyboard, admin_cars_list_keyboard
from app.localization.manager import t
from app.models.car import Car
from app.repositories.car import CarRepository
from app.services.cars.service import CarService

router = Router(name="admin_cars_list")


def render_car_admin_card(car: Car, language: Language) -> str:
    text = CarService.format_card(car, language)
    if not car.is_active:
        text += "\n" + t("admin_car_inactive_label", language)
    return text


@router.callback_query(AdminMenuCallback.filter(F.section == "cars"))
async def on_open_cars_section(
    query: CallbackQuery, callback_data: AdminMenuCallback, ctx: RequestContext, state: FSMContext
) -> None:
    if not await require_permission(query, ctx, "cars"):
        return
    await state.clear()
    cars = await CarRepository(ctx.session).list_all()
    title = t("admin_cars_title", ctx.language) if cars else t("admin_cars_empty", ctx.language)
    if query.message is not None:
        await query.message.edit_text(title, reply_markup=admin_cars_list_keyboard(ctx.language, cars))
    await query.answer()


@router.callback_query(AdminCarCallback.filter(F.action == "view"))
async def on_view_car(
    query: CallbackQuery, callback_data: AdminCarCallback, ctx: RequestContext
) -> None:
    if not await require_permission(query, ctx, "cars"):
        return
    car = await CarRepository(ctx.session).get(callback_data.car_id)
    if car is None:
        await query.answer(t("car_not_found", ctx.language), show_alert=True)
        return
    if query.message is not None:
        await query.message.edit_text(
            render_car_admin_card(car, ctx.language),
            reply_markup=admin_car_card_keyboard(ctx.language, car),
        )
    await query.answer()
