"""Блокировка/разблокировка игрока (раздел 27 ТЗ)."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.types import CallbackQuery

from app.admin.permissions import require_permission
from app.admin.users.profile import render_profile_card
from app.callbacks.admin import AdminUserCallback
from app.core.context import RequestContext
from app.keyboards.admin import admin_user_card_keyboard
from app.localization.manager import t
from app.repositories.history import record_event
from app.repositories.user import UserRepository

router = Router(name="admin_users_ban")


@router.callback_query(AdminUserCallback.filter(F.action.in_({"ban", "unban"})))
async def on_toggle_ban(
    query: CallbackQuery, callback_data: AdminUserCallback, ctx: RequestContext
) -> None:
    if not await require_permission(query, ctx, "users"):
        return

    user_repo = UserRepository(ctx.session)
    user = await user_repo.get(callback_data.user_id)
    if user is None:
        await query.answer(t("error_not_found", ctx.language), show_alert=True)
        return

    is_banned = callback_data.action == "ban"
    await user_repo.set_banned(user.id, is_banned)
    record_event(
        ctx.session, user.id, "admin_ban" if is_banned else "admin_unban", {},
        actor_admin_id=ctx.user.id,
    )
    user.is_banned = is_banned

    text = await render_profile_card(ctx, user)
    if query.message is not None:
        await query.message.edit_text(text, reply_markup=admin_user_card_keyboard(ctx.language, user))
    await query.answer(t("admin_action_done", ctx.language))
