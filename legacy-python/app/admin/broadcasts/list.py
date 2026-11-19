"""Раздел 'Рассылки' (раздел 25 ТЗ): список и карточка. Статистика
доставки — count_by_status по DeliveryStatus."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery

from app.admin.permissions import require_permission
from app.callbacks.admin import AdminBroadcastCallback, AdminMenuCallback
from app.core.context import RequestContext
from app.core.enums import DeliveryStatus, Language
from app.keyboards.admin import admin_broadcast_card_keyboard, admin_broadcasts_list_keyboard
from app.localization.manager import t
from app.models.broadcast import Broadcast
from app.repositories.broadcast import BroadcastRepository, BroadcastTargetRepository

router = Router(name="admin_broadcasts_list")


async def render_broadcast_card(ctx: RequestContext, broadcast: Broadcast) -> str:
    target_repo = BroadcastTargetRepository(ctx.session)
    sent = await target_repo.count_by_status(broadcast.id, DeliveryStatus.SENT)
    failed = await target_repo.count_by_status(broadcast.id, DeliveryStatus.FAILED)
    pending = await target_repo.count_by_status(broadcast.id, DeliveryStatus.PENDING)

    lines = [
        f"📣 ID {broadcast.id} · {broadcast.content_type.value} · {broadcast.audience.value}",
        f"{broadcast.schedule_type.value} · {broadcast.status.value}",
        (broadcast.text or "—")[:200],
        "",
        t("admin_bc_stats_line", ctx.language, sent=sent, failed=failed, pending=pending),
    ]
    return "\n".join(lines)


@router.callback_query(AdminMenuCallback.filter(F.section == "broadcasts"))
async def on_open_broadcasts_section(
    query: CallbackQuery, callback_data: AdminMenuCallback, ctx: RequestContext, state: FSMContext
) -> None:
    if not await require_permission(query, ctx, "broadcasts"):
        return
    await state.clear()
    broadcasts = await BroadcastRepository(ctx.session).list_all(limit=30)
    title = t("admin_bc_title", ctx.language) if broadcasts else t("admin_bc_empty", ctx.language)
    if query.message is not None:
        await query.message.edit_text(title, reply_markup=admin_broadcasts_list_keyboard(ctx.language, broadcasts))
    await query.answer()


@router.callback_query(AdminBroadcastCallback.filter(F.action == "view"))
async def on_view_broadcast(
    query: CallbackQuery, callback_data: AdminBroadcastCallback, ctx: RequestContext
) -> None:
    if not await require_permission(query, ctx, "broadcasts"):
        return
    broadcast = await BroadcastRepository(ctx.session).get(callback_data.broadcast_id)
    if broadcast is None:
        await query.answer(t("error_not_found", ctx.language), show_alert=True)
        return
    if query.message is not None:
        await query.message.edit_text(
            await render_broadcast_card(ctx, broadcast),
            reply_markup=admin_broadcast_card_keyboard(ctx.language, broadcast),
        )
    await query.answer()
