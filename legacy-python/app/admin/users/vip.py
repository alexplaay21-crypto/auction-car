"""Выдача/снятие VIP администратором (раздел 27 ТЗ)."""
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
from app.services.vip.service import VipService

router = Router(name="admin_users_vip")


@router.callback_query(AdminUserCallback.filter(F.action == "vip_grant"))
async def on_vip_grant(
    query: CallbackQuery, callback_data: AdminUserCallback, ctx: RequestContext
) -> None:
    if not await require_permission(query, ctx, "vip"):
        return
    if await VipService(ctx.session).grant_by_admin(callback_data.user_id, granted_by=ctx.user.id):
        record_event(ctx.session, callback_data.user_id, "admin_vip_grant", {}, actor_admin_id=ctx.user.id)
    await _refresh_card(query, ctx, callback_data.user_id)


@router.callback_query(AdminUserCallback.filter(F.action == "vip_revoke"))
async def on_vip_revoke(
    query: CallbackQuery, callback_data: AdminUserCallback, ctx: RequestContext
) -> None:
    if not await require_permission(query, ctx, "vip"):
        return
    if await VipService(ctx.session).revoke(callback_data.user_id):
        record_event(ctx.session, callback_data.user_id, "admin_vip_revoke", {}, actor_admin_id=ctx.user.id)
    await _refresh_card(query, ctx, callback_data.user_id)


async def _refresh_card(query: CallbackQuery, ctx: RequestContext, user_id: int) -> None:
    user = await UserRepository(ctx.session).get(user_id)
    if user is None:
        await query.answer(t("error_not_found", ctx.language), show_alert=True)
        return
    text = await render_profile_card(ctx, user)
    if query.message is not None:
        await query.message.edit_text(text, reply_markup=admin_user_card_keyboard(ctx.language, user))
    await query.answer(t("admin_action_done", ctx.language))
