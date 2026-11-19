"""Снятие администратора — только владелец бота."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.types import CallbackQuery

from app.admin.admins.list import render_admins
from app.callbacks.admin import AdminAdminsCallback
from app.core.context import RequestContext
from app.keyboards.admin import admin_admins_list_keyboard
from app.localization.manager import t
from app.repositories.user import AdminRepository

router = Router(name="admin_admins_remove")


@router.callback_query(AdminAdminsCallback.filter(F.action == "revoke"))
async def on_revoke_admin(
    query: CallbackQuery, callback_data: AdminAdminsCallback, ctx: RequestContext
) -> None:
    if not ctx.is_owner:
        await query.answer(t("admin_owner_only", ctx.language), show_alert=True)
        return

    await AdminRepository(ctx.session).revoke(callback_data.user_id)

    text, rows = await render_admins(ctx)
    if query.message is not None:
        await query.message.edit_text(text, reply_markup=admin_admins_list_keyboard(ctx.language, rows))
    await query.answer(t("admin_action_done", ctx.language))
