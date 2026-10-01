"""Удаление рассылки. Целевые записи (BroadcastTarget) удаляются вместе с
ней (ondelete=CASCADE на уровне БД, см. models/broadcast_target.py)."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.types import CallbackQuery

from app.admin.permissions import require_permission
from app.callbacks.admin import AdminBroadcastCallback, AdminMenuCallback
from app.core.context import RequestContext
from app.keyboards.admin import admin_broadcasts_list_keyboard
from app.localization.manager import t
from app.repositories.broadcast import BroadcastRepository

router = Router(name="admin_broadcasts_delete")


@router.callback_query(AdminBroadcastCallback.filter(F.action == "delete"))
async def on_delete_broadcast(
    query: CallbackQuery, callback_data: AdminBroadcastCallback, ctx: RequestContext
) -> None:
    if not await require_permission(query, ctx, "broadcasts"):
        return
    repo = BroadcastRepository(ctx.session)
    broadcast = await repo.get(callback_data.broadcast_id)
    if broadcast is None:
        await query.answer(t("error_not_found", ctx.language), show_alert=True)
        return
    await repo.delete(broadcast)

    broadcasts = await repo.list_all(limit=30)
    title = t("admin_bc_title", ctx.language) if broadcasts else t("admin_bc_empty", ctx.language)
    if query.message is not None:
        await query.message.edit_text(title, reply_markup=admin_broadcasts_list_keyboard(ctx.language, broadcasts))
    await query.answer(t("admin_action_done", ctx.language))
