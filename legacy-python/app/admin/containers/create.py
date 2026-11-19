"""Создание контейнера (раздел 27 ТЗ). Шаг 1: название | страна | цена
(можно с фото, формат в подписи). Шаг 2: шансы редкостей."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message

from app.admin.containers.list import render_container_admin_card
from app.admin.permissions import require_permission
from app.callbacks.admin import AdminContainerCallback
from app.core.context import RequestContext
from app.core.exceptions import AppError
from app.keyboards.admin import admin_container_card_keyboard
from app.localization.manager import t
from app.repositories.container import ContainerRepository
from app.states.admin_containers import AdminContainerStates

router = Router(name="admin_containers_create")


class ChanceStates(StatesGroup):
    chances = State()


def parse_container_create(text: str) -> dict:
    parts = [p.strip() for p in text.split("|")]
    if len(parts) != 3 or not parts[0] or not parts[2].isdigit():
        raise ValueError("format")
    return {"name": parts[0], "country": parts[1] or None, "price": int(parts[2])}


def parse_chances(raw: str) -> dict | None:
    raw = raw.strip()
    if raw == "-":
        return None
    p = raw.replace(",", ".").split()
    try:
        vals = [float(x) for x in p]
    except ValueError:
        vals = []
    if len(vals) != 4 or any(v < 0 for v in vals) or sum(vals) <= 0:
        raise AppError("Нужно 4 числа: обычный редкий эпический легендарный\nПример: 60 30 9 1\n«-» = общие шансы")
    return dict(zip(("common", "rare", "epic", "mythic"), vals))


@router.callback_query(AdminContainerCallback.filter(F.action == "create"))
async def on_create_prompt(
    query: CallbackQuery, callback_data: AdminContainerCallback, ctx: RequestContext, state: FSMContext
) -> None:
    if not await require_permission(query, ctx, "containers"):
        return
    await state.set_state(AdminContainerStates.waiting_for_create)
    if query.message is not None:
        await query.message.answer(t("admin_container_create_prompt", ctx.language))
    await query.answer()


@router.message(AdminContainerStates.waiting_for_create)
async def on_create_data(message: Message, ctx: RequestContext, state: FSMContext) -> None:
    text = message.caption if message.photo else message.text
    try:
        fields = parse_container_create(text or "")
    except (ValueError, TypeError) as exc:
        raise AppError(t("admin_format_invalid", ctx.language)) from exc
    if message.photo:
        fields["photo_file_id"] = message.photo[-1].file_id
    await state.update_data(fields=fields)
    await state.set_state(ChanceStates.chances)
    await message.answer(
        "🎲 Шансы выпадения редкостей одной строкой:\n"
        "обычный редкий эпический легендарный\n"
        "Пример: 60 30 9 1 (сумма не обязана быть 100)\n"
        "«-» = общие шансы"
    )


@router.message(ChanceStates.chances, F.text, ~F.text.startswith("/"))
async def on_chances(message: Message, ctx: RequestContext, state: FSMContext) -> None:
    chances = parse_chances(message.text or "")
    fields = (await state.get_data())["fields"]
    fields["rarity_chances"] = chances
    container = await ContainerRepository(ctx.session).create(**fields)
    await ctx.session.flush()
    await state.clear()
    await message.answer(
        t("admin_container_created", ctx.language, container_id=container.id)
        + "\n\n" + await render_container_admin_card(ctx, container),
        reply_markup=admin_container_card_keyboard(ctx.language, container),
    )
