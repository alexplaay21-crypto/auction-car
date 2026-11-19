"""Остановка рассылки (раздел 25 ТЗ: 'остановить'). Для повторяющейся —
переводит в STOPPED, фоновая задача больше не подхватит её на следующий
цикл (list_due фильтрует по статусу SCHEDULED)."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.types import CallbackQuery

from app.admin.broadcasts.list import render_broadcast_card
from app.admin.permissions import require_permission
from app.callbacks.admin import AdminBroadcastCallback
from app.core.context import RequestContext
from app.core.enums import BroadcastStatus
from app.keyboards.admin import admin_broadcast_card_keyboard
from app.localization.manager import t
from app.repositories.broadcast import BroadcastRepository

router = Router(name="admin_broadcasts_pause")


@router.callback_query(AdminBroadcastCallback.filter(F.action == "stop"))
async def on_stop_broadcast(
    query: CallbackQuery, callback_data: AdminBroadcastCallback, ctx: RequestContext
) -> None:
    if not await require_permission(query, ctx, "broadcasts"):
        return
    repo = BroadcastRepository(ctx.session)
    broadcast = await repo.get(callback_data.broadcast_id)
    if broadcast is None:
        await query.answer(t("error_not_found", ctx.language), show_alert=True)
        return

    await repo.set_status(broadcast.id, BroadcastStatus.STOPPED)
    broadcast.status = BroadcastStatus.STOPPED

    if query.message is not None:
        await query.message.edit_text(
            await render_broadcast_card(ctx, broadcast), reply_markup=admin_broadcast_card_keyboard(ctx.language, broadcast)
        )
    await query.answer(t("admin_action_done", ctx.language))
