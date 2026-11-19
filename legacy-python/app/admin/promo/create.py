"""Создание промокода кнопками: код, лимит, награды."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.filters.callback_data import CallbackData
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message
from aiogram.utils.keyboard import InlineKeyboardBuilder

from app.admin.permissions import require_permission
from app.admin.promo.list import render_promo_admin_card
from app.callbacks.admin import AdminPromoCallback
from app.core.context import RequestContext
from app.core.exceptions import AppError
from app.keyboards.admin import admin_promo_card_keyboard
from app.repositories.promo import PromoCodeRepository
from app.states.admin_promo import AdminPromoStates

router = Router(name="admin_promo_create")

KINDS = {
    "money": ("💰 Деньги", "Сколько денег? (число)"),
    "car": ("🚗 Машина", "ID машины (число из каталога)"),
    "container": ("📦 Контейнер", "ID контейнера и количество, например: 3 2 (или просто 3)"),
    "skill": ("⬆️ Навык", "ID навыка и уровень, например: 1 5 (или просто 1)"),
    "battle_pass": ("🎫 Уровни BP", "Сколько уровней BP добавить? (число)"),
    "vip": ("👑 VIP", ""),
}


class PromoWizCallback(CallbackData, prefix="pw"):
    action: str  # kind | done | cancel
    kind: str = "-"


def _fmt(n: int) -> str:
    return f"{n:,}".replace(",", " ")


def _describe(r: dict) -> str:
    t = r["type"]
    if t == "money":
        return f"💰 ${_fmt(r['amount'])}"
    if t == "car":
        return f"🚗 Машина #{r['car_id']}"
    if t == "container":
        return f"📦 Контейнер #{r['container_id']} ×{r.get('quantity', 1)}"
    if t == "skill":
        return f"⬆️ Навык #{r['skill_id']} ур. {r.get('level', 1)}"
    if t == "battle_pass":
        return f"🎫 +{r['levels']} ур. BP"
    return "👑 VIP"


def _menu(data: dict):
    rewards = data.get("rewards", [])
    limit = data.get("limit")
    text = f"🎟 <b>{data['code']}</b> · лимит: {limit if limit else '∞'}\n\n"
    text += "\n".join(_describe(r) for r in rewards) or "Наград пока нет."
    text += "\n\nДобавь награду:"
    b = InlineKeyboardBuilder()
    for k, (title, _) in KINDS.items():
        b.button(text=title, callback_data=PromoWizCallback(action="kind", kind=k))
    if rewards:
        b.button(text="✅ Создать", callback_data=PromoWizCallback(action="done"))
    b.button(text="❌ Отмена", callback_data=PromoWizCallback(action="cancel"))
    b.adjust(2, 2, 2, 1, 1)
    return text, b.as_markup()


@router.callback_query(AdminPromoCallback.filter(F.action == "create"))
async def on_create_prompt(query: CallbackQuery, callback_data: AdminPromoCallback, ctx: RequestContext, state: FSMContext) -> None:
    if not await require_permission(query, ctx, "promo"):
        return
    await state.clear()
    await state.set_state(AdminPromoStates.code)
    if query.message is not None:
        await query.message.answer("🎟 Напиши <b>код</b> промокода (например WELCOME)", parse_mode="HTML")
    await query.answer()


@router.message(AdminPromoStates.code)
async def on_code(message: Message, ctx: RequestContext, state: FSMContext) -> None:
    code = (message.text or "").strip()
    if not code or " " in code:
        raise AppError("Код без пробелов, например WELCOME")
    if await PromoCodeRepository(ctx.session).get_by_code(code) is not None:
        raise AppError("Такой код уже есть")
    await state.update_data(code=code, rewards=[])
    await state.set_state(AdminPromoStates.limit)
    await message.answer("👥 Сколько раз можно активировать? Число или <b>-</b> без лимита", parse_mode="HTML")


@router.message(AdminPromoStates.limit)
async def on_limit(message: Message, ctx: RequestContext, state: FSMContext) -> None:
    raw = (message.text or "").strip()
    if raw in ("-", ""):
        limit = None
    elif raw.isdigit() and int(raw) > 0:
        limit = int(raw)
    else:
        raise AppError("Число больше 0 или -")
    await state.update_data(limit=limit)
    await state.set_state(None)
    text, kb = _menu(await state.get_data())
    await message.answer(text, reply_markup=kb, parse_mode="HTML")


@router.callback_query(PromoWizCallback.filter())
async def on_wiz(query: CallbackQuery, callback_data: PromoWizCallback, ctx: RequestContext, state: FSMContext) -> None:
    if not await require_permission(query, ctx, "promo"):
        return
    data = await state.get_data()
    if "code" not in data or query.message is None:
        await query.answer("Устарело, начни заново", show_alert=True)
        return
    act = callback_data.action
    if act == "cancel":
        await state.clear()
        await query.message.delete()
        await query.answer("Отменено")
    elif act == "kind":
        kind = callback_data.kind
        if kind == "vip":
            rewards = data["rewards"] + [{"type": "vip"}]
            await state.update_data(rewards=rewards)
            text, kb = _menu(await state.get_data())
            await query.message.edit_text(text, reply_markup=kb, parse_mode="HTML")
        else:
            await state.update_data(kind=kind)
            await state.set_state(AdminPromoStates.value)
            await query.message.answer(KINDS[kind][1])
        await query.answer()
    elif act == "done":
        if not data["rewards"]:
            await query.answer("Добавь хотя бы одну награду", show_alert=True)
            return
        promo = await PromoCodeRepository(ctx.session).create(
            code=data["code"], activation_limit=data.get("limit"),
            rewards=data["rewards"], created_by=ctx.user.id)
        await ctx.session.commit()
        await state.clear()
        await query.message.edit_text(
            "✅ Промокод создан\n\n" + render_promo_admin_card(promo, ctx.language),
            reply_markup=admin_promo_card_keyboard(ctx.language, promo))
        await query.answer()


@router.message(AdminPromoStates.value)
async def on_value(message: Message, ctx: RequestContext, state: FSMContext) -> None:
    data = await state.get_data()
    kind = data.get("kind")
    nums = (message.text or "").replace(",", " ").split()
    if not nums or not all(n.isdigit() for n in nums) or int(nums[0]) <= 0:
        raise AppError("Нужны числа, например: 5000")
    a = int(nums[0])
    b = int(nums[1]) if len(nums) > 1 else 1
    reward = {
        "money": {"type": "money", "amount": a},
        "car": {"type": "car", "car_id": a},
        "container": {"type": "container", "container_id": a, "quantity": b},
        "skill": {"type": "skill", "skill_id": a, "level": b},
        "battle_pass": {"type": "battle_pass", "levels": a},
    }[kind]
    await state.update_data(rewards=data["rewards"] + [reward])
    await state.set_state(None)
    text, kb = _menu(await state.get_data())
    await message.answer(text, reply_markup=kb, parse_mode="HTML")
