"""Включение/выключение аукциона в группе (раздел 27 ТЗ: 'включить/
выключить аукцион')."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.types import CallbackQuery

from app.admin.groups.list import render_group_admin_card
from app.admin.permissions import require_permission
from app.callbacks.admin import AdminGroupCallback
from app.core.context import RequestContext
from app.keyboards.admin import admin_group_card_keyboard
from app.localization.manager import t
from app.repositories.group import GroupRepository

router = Router(name="admin_groups_edit")


@router.callback_query(AdminGroupCallback.filter(F.action == "toggle_auction"))
async def on_toggle_auction(
    query: CallbackQuery, callback_data: AdminGroupCallback, ctx: RequestContext
) -> None:
    if not await require_permission(query, ctx, "groups"):
        return
    repo = GroupRepository(ctx.session)
    group = await repo.get(callback_data.group_id)
    if group is None:
        await query.answer(t("error_not_found", ctx.language), show_alert=True)
        return

    enabled = not group.auction_enabled
    await repo.set_auction_enabled(group.id, enabled)
    group.auction_enabled = enabled

    if query.message is not None:
        await query.message.edit_text(
            render_group_admin_card(group, ctx.language), reply_markup=admin_group_card_keyboard(ctx.language, group)
        )
    await query.answer(t("admin_action_done", ctx.language))
