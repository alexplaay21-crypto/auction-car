"""Настройки VIP: комиссии (VIP = обычная − 10%) и бонус мест. Цена VIP — лот в магазине."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.filters.callback_data import CallbackData
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message
from aiogram.utils.keyboard import InlineKeyboardBuilder

from app.admin.permissions import require_permission
from app.callbacks.admin import AdminMenuCallback
from app.core.context import RequestContext
from app.core.exceptions import AppError
from app.repositories.settings import SettingsRepository
from app.services.economy.commissions import DEFAULT_COMMISSIONS
from app.services.garage.upgrades import DEFAULT_VIP_BONUS_SLOTS

router = Router(name="admin_vip_settings")

VIP_DISCOUNT = 0.10
ITEMS = {
    "commission_quick_sell": "⚡ Быстрая продажа",
    "commission_sell_state": "🏛 Продажа государству",
    "commission_sell_player": "🤝 Продажа игроку",
    "commission_transfer": "💳 Перевод",
}


class VipCb(CallbackData, prefix="avip"):
    key: str


class VipStates(StatesGroup):
    value = State()


def _vip_rate(regular: float) -> float:
    return round(max(regular - VIP_DISCOUNT, 0.0), 4)


async def _sync(session, user_id) -> dict:
    repo = SettingsRepository(session)
    out = {}
    for key in ITEMS:
        cur = await repo.get_value(key, DEFAULT_COMMISSIONS[key])
        regular = float(cur["regular"])
        out[key] = regular
        if float(cur.get("vip", -1)) != _vip_rate(regular):
            await repo.set_value(key, {"regular": regular, "vip": _vip_rate(regular)}, user_id)
    await session.commit()
    return out


async def _render(ctx: RequestContext):
    rates = await _sync(ctx.session, ctx.user.id)
    slots = await SettingsRepository(ctx.session).get_value("garage_vip_bonus_slots", DEFAULT_VIP_BONUS_SLOTS)
    lines = ["👑 <b>Настройки VIP</b>", "", "💸 Комиссии (обычный → VIP, всегда −10%)"]
    for key, title in ITEMS.items():
        lines.append(f"{title}: {round(rates[key]*100)}% → {round(_vip_rate(rates[key])*100)}%")
    lines += ["", f"🏠 Бонус мест VIP: +{slots}", "", "⭐ Цена VIP задаётся лотом в магазине"]
    b = InlineKeyboardBuilder()
    for key, title in ITEMS.items():
        b.button(text="✏️ " + title, callback_data=VipCb(key=key))
    b.button(text="✏️ Места VIP", callback_data=VipCb(key="slots"))
    b.button(text="◀️ В меню", callback_data=AdminMenuCallback(section="main"))
    b.adjust(1)
    return "\n".join(lines), b.as_markup()


@router.callback_query(AdminMenuCallback.filter(F.section == "vip"))
async def on_open(query: CallbackQuery, callback_data: AdminMenuCallback, ctx: RequestContext, state: FSMContext) -> None:
    if not await require_permission(query, ctx, "vip"):
        return
    await state.clear()
    text, kb = await _render(ctx)
    if query.message is not None:
        await query.message.edit_text(text, reply_markup=kb, parse_mode="HTML")
    await query.answer()


@router.callback_query(VipCb.filter())
async def on_pick(query: CallbackQuery, callback_data: VipCb, ctx: RequestContext, state: FSMContext) -> None:
    if not await require_permission(query, ctx, "vip"):
        return
    await state.set_state(VipStates.value)
    await state.update_data(vip_key=callback_data.key)
    ask = "Сколько мест добавляет VIP? (число)" if callback_data.key == "slots" \
        else "Обычная комиссия в процентах (0-100), например 10. VIP получит на 10% меньше."
    if query.message is not None:
        await query.message.answer(ask)
    await query.answer()


@router.message(VipStates.value, ~F.text.startswith("/"))
async def on_value(message: Message, ctx: RequestContext, state: FSMContext) -> None:
    raw = (message.text or "").strip().replace("%", "").replace(",", ".")
    try:
        num = float(raw)
    except ValueError:
        raise AppError("Нужно число")
    key = (await state.get_data()).get("vip_key")
    repo = SettingsRepository(ctx.session)
    if key == "slots":
        if num < 0 or num != int(num):
            raise AppError("Целое число от 0")
        await repo.set_value("garage_vip_bonus_slots", int(num), ctx.user.id)
    else:
        if not 0 <= num <= 100:
            raise AppError("Процент от 0 до 100")
        regular = round(num / 100, 4)
        await repo.set_value(key, {"regular": regular, "vip": _vip_rate(regular)}, ctx.user.id)
    await ctx.session.commit()
    await state.clear()
    text, kb = await _render(ctx)
    await message.answer("✅ Сохранено\n\n" + text, reply_markup=kb, parse_mode="HTML")
