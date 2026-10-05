"""Админка комиссий: для каждого типа свои значения для обычных и VIP (в процентах)."""
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

router = Router(name="admin_commissions")

ITEMS = {
    "commission_quick_sell": "⚡ Быстрая продажа",
    "commission_sell_state": "🏛 Продажа государству",
    "commission_sell_player": "🤝 Продажа игроку",
    "commission_transfer": "💳 Перевод",
}


class ComCb(CallbackData, prefix="acom"):
    key: str


class ComStates(StatesGroup):
    value = State()


def _pct(x: float) -> str:
    return f"{round(float(x) * 100, 2):g}%"


async def _render(ctx: RequestContext):
    repo = SettingsRepository(ctx.session)
    lines = ["💸 <b>Комиссии</b> (обычный / VIP)", ""]
    b = InlineKeyboardBuilder()
    for key, title in ITEMS.items():
        cur = await repo.get_value(key, DEFAULT_COMMISSIONS[key])
        reg = float(cur["regular"])
        vip = float(cur.get("vip", reg))
        lines.append(f"{title}: {_pct(reg)} / {_pct(vip)}")
        b.button(text="✏️ " + title, callback_data=ComCb(key=key))
    b.button(text="◀️ В меню", callback_data=AdminMenuCallback(section="main"))
    b.adjust(1)
    return "\n".join(lines), b.as_markup()


@router.callback_query(AdminMenuCallback.filter(F.section == "commissions"))
async def on_open(query: CallbackQuery, callback_data: AdminMenuCallback, ctx: RequestContext, state: FSMContext) -> None:
    if not await require_permission(query, ctx, "vip"):
        return
    await state.clear()
    txt, kb = await _render(ctx)
    if query.message is not None:
        await query.message.edit_text(txt, reply_markup=kb, parse_mode="HTML")
    await query.answer()


@router.callback_query(ComCb.filter())
async def on_pick(query: CallbackQuery, callback_data: ComCb, ctx: RequestContext, state: FSMContext) -> None:
    if not await require_permission(query, ctx, "vip"):
        return
    if callback_data.key not in ITEMS:
        await query.answer()
        return
    await state.set_state(ComStates.value)
    await state.update_data(com_key=callback_data.key)
    if query.message is not None:
        await query.message.answer(
            f"{ITEMS[callback_data.key]}\nДва числа в процентах: обычный VIP\n"
            "Пример: 10 5 (VIP 0 = без комиссии)"
        )
    await query.answer()


@router.message(ComStates.value, F.text, ~F.text.startswith("/"))
async def on_value(message: Message, ctx: RequestContext, state: FSMContext) -> None:
    parts = (message.text or "").replace("%", "").replace(",", ".").split()
    try:
        vals = [float(x) for x in parts]
    except ValueError:
        vals = []
    if len(vals) != 2 or any(not 0 <= v <= 100 for v in vals):
        raise AppError("Нужно два числа от 0 до 100: обычный VIP\nПример: 10 5")
    key = (await state.get_data()).get("com_key")
    if key not in ITEMS:
        raise AppError("Начни заново")
    await SettingsRepository(ctx.session).set_value(
        key, {"regular": round(vals[0] / 100, 4), "vip": round(vals[1] / 100, 4)}, ctx.user.id
    )
    await ctx.session.commit()
    await state.clear()
    txt, kb = await _render(ctx)
    await message.answer("✅ Сохранено\n\n" + txt, reply_markup=kb, parse_mode="HTML")
