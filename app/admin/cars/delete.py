"""'Удаление' машины = скрытие (is_active=False): у машин могут быть
владельцы в гаражах игроков (FK RESTRICT), поэтому физическое удаление
сломало бы их коллекции. Скрытая машина не выпадает из контейнеров и не
находится по /car, но её можно вернуть."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.types import CallbackQuery

from app.admin.cars.list import render_car_admin_card
from app.admin.permissions import require_permission
from app.callbacks.admin import AdminCarCallback
from app.core.context import RequestContext
from app.keyboards.admin import admin_car_card_keyboard
from app.localization.manager import t
from app.repositories.car import CarRepository

router = Router(name="admin_cars_delete")


@router.callback_query(AdminCarCallback.filter(F.action.in_({"hide", "restore"})))
async def on_toggle_car(
    query: CallbackQuery, callback_data: AdminCarCallback, ctx: RequestContext
) -> None:
    if not await require_permission(query, ctx, "cars"):
        return
    repo = CarRepository(ctx.session)
    car = await repo.get(callback_data.car_id)
    if car is None:
        await query.answer(t("car_not_found", ctx.language), show_alert=True)
        return

    is_active = callback_data.action == "restore"
    await repo.set_active(car.id, is_active)
    car.is_active = is_active

    if query.message is not None:
        await query.message.edit_text(
            render_car_admin_card(car, ctx.language),
            reply_markup=admin_car_card_keyboard(ctx.language, car),
        )
    await query.answer(t("admin_action_done", ctx.language))
