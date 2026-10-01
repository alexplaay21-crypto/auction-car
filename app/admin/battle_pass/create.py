"""Создание Battle Pass: название | цена | уровней | дней. Новый пропуск
создаётся активным (BattlePass.is_active=True) — старый деактивируется
явно (get_active() берёт самый свежий активный)."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.admin.battle_pass.list import render_bp_admin_text
from app.admin.permissions import require_permission
from app.callbacks.admin import AdminBpCallback
from app.core.context import RequestContext
from app.core.exceptions import AppError
from app.keyboards.admin import admin_bp_keyboard
from app.localization.manager import t
from app.repositories.battle_pass import BattlePassRepository
from app.states.admin_bp import AdminBpStates

router = Router(name="admin_bp_create")


def parse_bp_create(text: str) -> dict:
    parts = [p.strip() for p in text.split("|")]
    if len(parts) != 4 or not parts[0] or not all(p.isdigit() for p in parts[1:]):
        raise ValueError("format")
    return {
        "name": parts[0], "price": int(parts[1]),
        "levels_count": int(parts[2]), "duration_days": int(parts[3]),
    }


@router.callback_query(AdminBpCallback.filter(F.action == "create"))
async def on_create_prompt(
    query: CallbackQuery, callback_data: AdminBpCallback, ctx: RequestContext, state: FSMContext
) -> None:
    if not await require_permission(query, ctx, "battle_pass"):
        return
    await state.set_state(AdminBpStates.waiting_for_create)
    if query.message is not None:
        await query.message.answer(t("admin_bp_create_prompt", ctx.language))
    await query.answer()


@router.message(AdminBpStates.waiting_for_create)
async def on_create_data(message: Message, ctx: RequestContext, state: FSMContext) -> None:
    try:
        fields = parse_bp_create(message.text or "")
    except ValueError as exc:
        raise AppError(t("admin_format_invalid", ctx.language)) from exc

    repo = BattlePassRepository(ctx.session)
    existing = await repo.get_active()
    if existing is not None:
        await repo.update_fields(existing.id, is_active=False)

    await repo.create(**fields, is_active=True)
    await state.clear()

    text, has_active = await render_bp_admin_text(ctx)
    await message.answer(text, reply_markup=admin_bp_keyboard(ctx.language, has_active))
