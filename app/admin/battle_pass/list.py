"""Раздел 'Battle Pass': статус активного пропуска и его уровни/награды."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery

from app.admin.permissions import require_permission
from app.callbacks.admin import AdminMenuCallback
from app.core.context import RequestContext
from app.keyboards.admin import admin_bp_keyboard
from app.localization.manager import t
from app.repositories.battle_pass import BattlePassLevelRepository, BattlePassRepository, BattlePassRewardRepository

router = Router(name="admin_bp_list")


async def render_bp_admin_text(ctx: RequestContext) -> tuple[str, bool]:
    bp = await BattlePassRepository(ctx.session).get_active()
    if bp is None:
        return t("admin_bp_none", ctx.language), False

    lines = [
        f"🎫 {bp.name} (ID {bp.id})",
        t("bp_offer", ctx.language, price=bp.price, levels=bp.levels_count),
    ]
    levels = await BattlePassLevelRepository(ctx.session).list_for_pass(bp.id)
    lines.append("")
    if not levels:
        lines.append(t("admin_bp_no_levels", ctx.language))
    for level in levels:
        rewards = await BattlePassRewardRepository(ctx.session).list_for_level(level.id)
        reward_desc = ", ".join(f"{r.reward_type.value}:{r.payload}" for r in rewards) or "—"
        lines.append(f"{level.level_number}. {reward_desc}")
    return "\n".join(lines), True


@router.callback_query(AdminMenuCallback.filter(F.section == "battle_pass"))
async def on_open_bp_section(
    query: CallbackQuery, callback_data: AdminMenuCallback, ctx: RequestContext, state: FSMContext
) -> None:
    if not await require_permission(query, ctx, "battle_pass"):
        return
    await state.clear()
    text, has_active = await render_bp_admin_text(ctx)
    if query.message is not None:
        await query.message.edit_text(text, reply_markup=admin_bp_keyboard(ctx.language, has_active))
    await query.answer()
