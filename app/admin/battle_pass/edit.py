"""Добавление награды к уровню Battle Pass: номер_уровня тип payload_json
(уровень создаётся, если его ещё не было)."""
from __future__ import annotations

import json

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.admin.battle_pass.list import render_bp_admin_text
from app.admin.permissions import require_permission
from app.callbacks.admin import AdminBpCallback
from app.core.context import RequestContext
from app.core.enums import RewardType
from app.core.exceptions import AppError
from app.keyboards.admin import admin_bp_keyboard
from app.localization.manager import t
from app.repositories.battle_pass import BattlePassLevelRepository, BattlePassRepository, BattlePassRewardRepository
from app.states.admin_bp import AdminBpStates

router = Router(name="admin_bp_edit")


@router.callback_query(AdminBpCallback.filter(F.action == "add_level"))
async def on_add_level_prompt(
    query: CallbackQuery, callback_data: AdminBpCallback, ctx: RequestContext, state: FSMContext
) -> None:
    if not await require_permission(query, ctx, "battle_pass"):
        return
    if await BattlePassRepository(ctx.session).get_active() is None:
        await query.answer(t("admin_bp_none", ctx.language), show_alert=True)
        return
    await state.set_state(AdminBpStates.waiting_for_add_reward)
    if query.message is not None:
        await query.message.answer(t("admin_bp_add_reward_prompt", ctx.language))
    await query.answer()


@router.message(AdminBpStates.waiting_for_add_reward)
async def on_add_reward_data(message: Message, ctx: RequestContext, state: FSMContext) -> None:
    parts = (message.text or "").strip().split(maxsplit=2)
    try:
        if len(parts) != 3 or not parts[0].isdigit():
            raise ValueError("format")
        level_number = int(parts[0])
        reward_type = RewardType(parts[1].lower())
        payload = json.loads(parts[2])
        if not isinstance(payload, dict):
            raise ValueError("format")
    except (ValueError, TypeError, json.JSONDecodeError) as exc:
        raise AppError(t("admin_bp_reward_invalid", ctx.language)) from exc

    bp = await BattlePassRepository(ctx.session).get_active()
    if bp is None:
        raise AppError(t("admin_bp_none", ctx.language))

    level_repo = BattlePassLevelRepository(ctx.session)
    level = await level_repo.get_by_number(bp.id, level_number)
    if level is None:
        level = await level_repo.create(bp.id, level_number)
        await ctx.session.flush()

    await BattlePassRewardRepository(ctx.session).add_reward(level.id, reward_type, payload)
    await state.clear()

    text, has_active = await render_bp_admin_text(ctx)
    await message.answer(text, reply_markup=admin_bp_keyboard(ctx.language, has_active))
