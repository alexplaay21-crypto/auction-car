"""📦 Контейнеры игрока (награды магазина/BP/промокодов/админа): список и
открытие без аукциона. Только ЛС — как и расширение гаража."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.exceptions import TelegramBadRequest
from aiogram.types import CallbackQuery

from app.callbacks.garage import ContainerInvCallback
from app.core.context import RequestContext
from app.keyboards.garage import container_inventory_keyboard
from app.localization.manager import t
from app.repositories.container import UserContainerRepository
from app.services.cars.service import CarService
from app.services.containers.inventory import ContainerInventoryService

router = Router(name="garage_containers")


async def _show_list(query: CallbackQuery, ctx: RequestContext) -> None:
    rows = await UserContainerRepository(ctx.session).list_for_user(ctx.user.id)
    text = t("container_inv_title" if rows else "container_inv_empty", ctx.language)
    if query.message is not None:
        try:
            await query.message.edit_text(text, reply_markup=container_inventory_keyboard(ctx.language, rows))
        except TelegramBadRequest:
            pass


@router.callback_query(ContainerInvCallback.filter(F.action == "list"))
async def on_list(query: CallbackQuery, callback_data: ContainerInvCallback, ctx: RequestContext) -> None:
    await _show_list(query, ctx)
    await query.answer()


@router.callback_query(ContainerInvCallback.filter(F.action == "open"))
async def on_open(query: CallbackQuery, callback_data: ContainerInvCallback, ctx: RequestContext) -> None:
    result = await ContainerInventoryService(ctx.session).open(ctx.user, callback_data.container_id)
    text = t("container_inv_opened", ctx.language) + "\n" + CarService.format_card(result.car, ctx.language)
    if result.auto_sold_amount is not None:
        text += "\n\n" + t("container_inv_auto_sold", ctx.language, amount=result.auto_sold_amount)
    if query.message is not None:
        await query.message.answer(text)
    await _show_list(query, ctx)
    await query.answer()
