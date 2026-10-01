"""Удаление группы из управления ботом (деактивация — раздел 27 ТЗ:
'удалить из группу'). Останавливает и её текущие комнаты, как при
исключении бота из чата (см. handlers/settings/group.py — та же логика,
инициированная администратором, а не Telegram-событием)."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.types import CallbackQuery

from app.admin.permissions import require_permission
from app.callbacks.admin import AdminGroupCallback, AdminMenuCallback
from app.core.context import RequestContext
from app.core.enums import RoomScope
from app.localization.manager import t
from app.repositories.group import GroupRepository
from app.repositories.room import RoomRepository

router = Router(name="admin_groups_delete")


@router.callback_query(AdminGroupCallback.filter(F.action == "remove"))
async def on_remove_group(query: CallbackQuery, callback_data: AdminGroupCallback, ctx: RequestContext) -> None:
    if not await require_permission(query, ctx, "groups"):
        return
    await GroupRepository(ctx.session).deactivate(callback_data.group_id)
    await RoomRepository(ctx.session).request_stop_for_scope(RoomScope.GROUP, callback_data.group_id)

    if query.message is not None:
        await query.message.edit_text(
            t("admin_group_removed", ctx.language),
            reply_markup=None,
        )
        from app.keyboards.admin import admin_menu_keyboard

        await query.message.answer(t("admin_menu_title", ctx.language), reply_markup=admin_menu_keyboard(ctx.language))
    await query.answer(t("admin_action_done", ctx.language))
