"""Правка контейнера и его состава: поля (поле=значение: name, country,
price) и привязка машин с весом выпадения ('ID [вес]' — добавить/
обновить, 'ID' — убрать)."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.admin.containers.list import render_container_admin_card
from app.admin.permissions import require_permission
from app.callbacks.admin import AdminContainerCallback
from app.core.context import RequestContext
from app.core.exceptions import AppError
from app.keyboards.admin import admin_container_card_keyboard
from app.localization.manager import t
from app.repositories.car import CarRepository
from app.repositories.container import ContainerCarRepository, ContainerRepository
from app.states.admin_containers import AdminContainerStates

router = Router(name="admin_containers_edit")

EDITABLE_FIELDS = ("name", "country", "price")


async def _prompt(query: CallbackQuery, ctx: RequestContext, state: FSMContext,
                  cb: AdminContainerCallback, target_state, prompt_key: str) -> None:
    if not await require_permission(query, ctx, "containers"):
        return
    await state.set_state(target_state)
    await state.update_data(admin_container_id=cb.container_id)
    if query.message is not None:
        await query.message.answer(t(prompt_key, ctx.language))
    await query.answer()


async def _show_card(message: Message, ctx: RequestContext, container_id: int, prefix_key: str) -> None:
    container = await ContainerRepository(ctx.session).get(container_id)
    await ctx.session.refresh(container)
    await message.answer(
        t(prefix_key, ctx.language) + "\n\n" + await render_container_admin_card(ctx, container),
        reply_markup=admin_container_card_keyboard(ctx.language, container),
    )


@router.callback_query(AdminContainerCallback.filter(F.action == "edit"))
async def on_edit_prompt(query: CallbackQuery, callback_data: AdminContainerCallback,
                         ctx: RequestContext, state: FSMContext) -> None:
    await _prompt(query, ctx, state, callback_data, AdminContainerStates.waiting_for_edit,
                  "admin_container_edit_prompt")


@router.callback_query(AdminContainerCallback.filter(F.action == "add_car"))
async def on_add_car_prompt(query: CallbackQuery, callback_data: AdminContainerCallback,
                            ctx: RequestContext, state: FSMContext) -> None:
    await _prompt(query, ctx, state, callback_data, AdminContainerStates.waiting_for_add_car,
                  "admin_container_add_car_prompt")


@router.callback_query(AdminContainerCallback.filter(F.action == "remove_car"))
async def on_remove_car_prompt(query: CallbackQuery, callback_data: AdminContainerCallback,
                               ctx: RequestContext, state: FSMContext) -> None:
    await _prompt(query, ctx, state, callback_data, AdminContainerStates.waiting_for_remove_car,
                  "admin_container_remove_car_prompt")


@router.message(AdminContainerStates.waiting_for_edit)
async def on_edit_data(message: Message, ctx: RequestContext, state: FSMContext) -> None:
    container_id = (await state.get_data()).get("admin_container_id")
    updates: dict = {}
    try:
        for line in (message.text or "").splitlines():
            if not line.strip():
                continue
            field, _, raw = line.partition("=")
            field, raw = field.strip().lower(), raw.strip()
            if field not in EDITABLE_FIELDS:
                raise ValueError(field)
            if field == "price":
                updates[field] = int(raw)
            elif field == "name":
                if not raw:
                    raise ValueError(field)
                updates[field] = raw
            else:
                updates[field] = raw or None
        if not updates or container_id is None:
            raise ValueError("empty")
    except (ValueError, TypeError) as exc:
        raise AppError(t("admin_format_invalid", ctx.language)) from exc

    await ContainerRepository(ctx.session).update_fields(container_id, **updates)
    await state.clear()
    await _show_card(message, ctx, container_id, "admin_container_updated")


@router.message(AdminContainerStates.waiting_for_add_car)
async def on_add_car_data(message: Message, ctx: RequestContext, state: FSMContext) -> None:
    container_id = (await state.get_data()).get("admin_container_id")
    parts = (message.text or "").split()
    if container_id is None or not parts or len(parts) > 2 or not all(p.isdigit() for p in parts):
        raise AppError(t("admin_format_invalid", ctx.language))

    car_id = int(parts[0])
    weight = int(parts[1]) if len(parts) == 2 else 1
    if weight < 1:
        raise AppError(t("admin_format_invalid", ctx.language))
    if await CarRepository(ctx.session).get(car_id) is None:
        raise AppError(t("car_not_found", ctx.language))

    link_repo = ContainerCarRepository(ctx.session)
    existing = {link.car_id for link in await link_repo.list_for_container(container_id)}
    if car_id in existing:
        await link_repo.set_weight(container_id, car_id, weight)
    else:
        await link_repo.add_car(container_id, car_id, weight)
        await ctx.session.flush()

    await state.clear()
    await _show_card(message, ctx, container_id, "admin_action_done")


@router.message(AdminContainerStates.waiting_for_remove_car)
async def on_remove_car_data(message: Message, ctx: RequestContext, state: FSMContext) -> None:
    container_id = (await state.get_data()).get("admin_container_id")
    raw = (message.text or "").strip()
    if container_id is None or not raw.isdigit():
        raise AppError(t("admin_format_invalid", ctx.language))

    await ContainerCarRepository(ctx.session).remove_car(container_id, int(raw))
    await ctx.session.flush()
    await state.clear()
    await _show_card(message, ctx, container_id, "admin_action_done")


@router.callback_query(AdminContainerCallback.filter(F.action == "chances"))
async def on_chances_prompt(query: CallbackQuery, callback_data: AdminContainerCallback,
                            ctx: RequestContext, state: FSMContext) -> None:
    if not await require_permission(query, ctx, "containers"):
        return
    await state.set_state(AdminContainerStates.waiting_for_chances)
    await state.update_data(admin_container_id=callback_data.container_id)
    if query.message is not None:
        await query.message.answer(
            "🎲 Шансы редкостей одной строкой:\n"
            "обычный редкий эпический легендарный\n"
            "Пример: 60 30 9 1 (сумма не обязана быть 100)\n"
            "«-» = общие шансы"
        )
    await query.answer()


@router.message(AdminContainerStates.waiting_for_chances, F.text, ~F.text.startswith("/"))
async def on_chances_data(message: Message, ctx: RequestContext, state: FSMContext) -> None:
    from app.admin.containers.create import parse_chances
    from app.models.container import Container

    container_id = (await state.get_data()).get("admin_container_id")
    chances = parse_chances(message.text or "")
    container = await ctx.session.get(Container, container_id) if container_id else None
    if container is None:
        raise AppError(t("admin_format_invalid", ctx.language))
    container.rarity_chances = chances
    await ctx.session.flush()
    await state.clear()
    await _show_card(message, ctx, container_id, "admin_action_done")
