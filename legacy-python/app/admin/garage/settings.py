"""Админ-раздел 'Гараж' (раздел 27 ТЗ): тарифы расширения (вместимость →
цена) и лимиты (максимум без VIP, бонус мест VIP). Всё хранится в БД
(garage_upgrade_tiers, Setting) — services/garage/upgrades.py читает
оттуда, ничего не зашито в код."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.admin.permissions import require_permission
from app.callbacks.admin import AdminGarageCallback, AdminMenuCallback
from app.core.context import RequestContext
from app.core.exceptions import AppError
from app.keyboards.admin import admin_garage_keyboard
from app.localization.manager import t
from app.repositories.garage import GarageUpgradeTierRepository
from app.repositories.settings import SettingsRepository
from app.services.garage.upgrades import DEFAULT_MAX_CAPACITY_NO_VIP, DEFAULT_VIP_BONUS_SLOTS
from app.states.admin_garage import AdminGarageStates

router = Router(name="admin_garage_settings")


async def _render(ctx: RequestContext) -> str:
    tiers = await GarageUpgradeTierRepository(ctx.session).list_ordered()
    settings_repo = SettingsRepository(ctx.session)
    max_no_vip = await settings_repo.get_value("garage_max_capacity_no_vip", DEFAULT_MAX_CAPACITY_NO_VIP)
    vip_bonus = await settings_repo.get_value("garage_vip_bonus_slots", DEFAULT_VIP_BONUS_SLOTS)

    lines = [t("admin_garage_title", ctx.language)]
    if not tiers:
        lines.append(t("admin_garage_no_tiers", ctx.language))
    for tier in tiers:
        lines.append(t("admin_garage_tier_line", ctx.language, capacity=tier.new_capacity, price=tier.price))
    lines.append("")
    lines.append(t("admin_garage_limits_line", ctx.language, max=max_no_vip, bonus=vip_bonus))
    return "\n".join(lines)


async def _show(target: Message, ctx: RequestContext) -> None:
    await target.answer(await _render(ctx), reply_markup=admin_garage_keyboard(ctx.language))


@router.callback_query(AdminMenuCallback.filter(F.section == "garage"))
async def on_open_garage_section(
    query: CallbackQuery, callback_data: AdminMenuCallback, ctx: RequestContext, state: FSMContext
) -> None:
    if not await require_permission(query, ctx, "garage"):
        return
    await state.clear()
    if query.message is not None:
        await query.message.edit_text(
            await _render(ctx), reply_markup=admin_garage_keyboard(ctx.language)
        )
    await query.answer()


@router.callback_query(AdminGarageCallback.filter())
async def on_garage_action(
    query: CallbackQuery, callback_data: AdminGarageCallback, ctx: RequestContext, state: FSMContext
) -> None:
    if not await require_permission(query, ctx, "garage"):
        return
    mapping = {
        "tier_add": (AdminGarageStates.waiting_for_tier_add, "admin_garage_tier_add_prompt"),
        "tier_del": (AdminGarageStates.waiting_for_tier_del, "admin_garage_tier_del_prompt"),
        "limits": (AdminGarageStates.waiting_for_limits, "admin_garage_limits_prompt"),
    }
    target = mapping.get(callback_data.action)
    if target is None:
        await query.answer()
        return
    await state.set_state(target[0])
    if query.message is not None:
        await query.message.answer(t(target[1], ctx.language))
    await query.answer()


def _ints(text: str | None, expected: int) -> list[int]:
    parts = (text or "").split()
    if len(parts) != expected or not all(p.isdigit() for p in parts):
        raise ValueError("format")
    return [int(p) for p in parts]


@router.message(AdminGarageStates.waiting_for_tier_add)
async def on_tier_add(message: Message, ctx: RequestContext, state: FSMContext) -> None:
    try:
        capacity, price = _ints(message.text, 2)
    except ValueError as exc:
        raise AppError(t("admin_format_invalid", ctx.language)) from exc
    if capacity < 1:
        raise AppError(t("admin_format_invalid", ctx.language))

    await GarageUpgradeTierRepository(ctx.session).upsert(capacity, price)
    await ctx.session.flush()
    await state.clear()
    await _show(message, ctx)


@router.message(AdminGarageStates.waiting_for_tier_del)
async def on_tier_del(message: Message, ctx: RequestContext, state: FSMContext) -> None:
    try:
        (capacity,) = _ints(message.text, 1)
    except ValueError as exc:
        raise AppError(t("admin_format_invalid", ctx.language)) from exc

    if not await GarageUpgradeTierRepository(ctx.session).delete_by_capacity(capacity):
        raise AppError(t("error_not_found", ctx.language))
    await ctx.session.flush()
    await state.clear()
    await _show(message, ctx)


@router.message(AdminGarageStates.waiting_for_limits)
async def on_limits(message: Message, ctx: RequestContext, state: FSMContext) -> None:
    try:
        max_no_vip, vip_bonus = _ints(message.text, 2)
    except ValueError as exc:
        raise AppError(t("admin_format_invalid", ctx.language)) from exc
    if max_no_vip < 1:
        raise AppError(t("admin_format_invalid", ctx.language))

    settings_repo = SettingsRepository(ctx.session)
    await settings_repo.set_value("garage_max_capacity_no_vip", max_no_vip, ctx.user.id)
    await settings_repo.set_value("garage_vip_bonus_slots", vip_bonus, ctx.user.id)
    await ctx.session.flush()
    await state.clear()
    await _show(message, ctx)
