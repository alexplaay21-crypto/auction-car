"""Раздел 'VIP': цена и комиссии (раздел 19 ТЗ — 'цены/преимущества/
комиссии/бонусы настраиваются через админку'). Всё хранится в Setting;
services/vip/service.py и services/economy/commissions.py читают оттуда."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.admin.permissions import require_permission
from app.callbacks.admin import AdminMenuCallback, AdminVipCallback
from app.core.context import RequestContext
from app.core.exceptions import AppError
from app.keyboards.admin import admin_vip_keyboard
from app.localization.manager import t
from app.repositories.settings import SettingsRepository
from app.services.economy.commissions import DEFAULT_COMMISSIONS
from app.services.garage.upgrades import DEFAULT_VIP_BONUS_SLOTS
from app.services.vip.service import DEFAULT_VIP_PRICE
from app.states.admin_vip import AdminVipStates

router = Router(name="admin_vip_settings")

_COMMISSION_KEYS = ("commission_quick_sell", "commission_sell_state", "commission_sell_player", "commission_transfer")


async def _render(ctx: RequestContext) -> str:
    settings_repo = SettingsRepository(ctx.session)
    price = await settings_repo.get_value("vip_price", DEFAULT_VIP_PRICE)
    bonus = await settings_repo.get_value("garage_vip_bonus_slots", DEFAULT_VIP_BONUS_SLOTS)

    lines = [t("admin_vip_title", ctx.language), t("admin_vip_price_line", ctx.language, price=price)]
    lines.append(t("admin_vip_bonus_line", ctx.language, bonus=bonus))
    lines.append("")
    for key in _COMMISSION_KEYS:
        rates = await settings_repo.get_value(key, DEFAULT_COMMISSIONS[key])
        lines.append(f"{key}: regular={rates['regular']}, vip={rates['vip']}")
    return "\n".join(lines)


@router.callback_query(AdminMenuCallback.filter(F.section == "vip"))
async def on_open_vip_section(
    query: CallbackQuery, callback_data: AdminMenuCallback, ctx: RequestContext, state: FSMContext
) -> None:
    if not await require_permission(query, ctx, "vip"):
        return
    await state.clear()
    if query.message is not None:
        await query.message.edit_text(await _render(ctx), reply_markup=admin_vip_keyboard(ctx.language))
    await query.answer()


@router.callback_query(AdminVipCallback.filter(F.action == "edit"))
async def on_edit_prompt(
    query: CallbackQuery, callback_data: AdminVipCallback, ctx: RequestContext, state: FSMContext
) -> None:
    if not await require_permission(query, ctx, "vip"):
        return
    await state.set_state(AdminVipStates.waiting_for_edit)
    if query.message is not None:
        await query.message.answer(t("admin_vip_edit_prompt", ctx.language))
    await query.answer()


@router.message(AdminVipStates.waiting_for_edit)
async def on_edit_data(message: Message, ctx: RequestContext, state: FSMContext) -> None:
    settings_repo = SettingsRepository(ctx.session)
    try:
        for line in (message.text or "").splitlines():
            if not line.strip():
                continue
            key, _, raw = line.partition("=")
            key, raw = key.strip(), raw.strip()
            if key == "vip_price":
                await settings_repo.set_value(key, int(raw), ctx.user.id)
            elif key == "garage_vip_bonus_slots":
                await settings_repo.set_value(key, int(raw), ctx.user.id)
            elif key in _COMMISSION_KEYS:
                regular_raw, vip_raw = (p.strip() for p in raw.split(","))
                await settings_repo.set_value(
                    key, {"regular": float(regular_raw), "vip": float(vip_raw)}, ctx.user.id
                )
            else:
                raise ValueError(key)
    except (ValueError, TypeError) as exc:
        raise AppError(t("admin_format_invalid", ctx.language)) from exc

    await state.clear()
    await message.answer(await _render(ctx), reply_markup=admin_vip_keyboard(ctx.language))
