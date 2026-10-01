"""Раздел 'Группы': список и карточка. Добавление группы (add.py)
происходит автоматически при первом сообщении бота в группе — здесь
только просмотр и управление уже добавленными."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery

from app.admin.permissions import require_permission
from app.callbacks.admin import AdminGroupCallback, AdminMenuCallback
from app.core.context import RequestContext
from app.core.enums import Language
from app.keyboards.admin import admin_group_card_keyboard, admin_groups_list_keyboard
from app.localization.manager import t
from app.models.group import Group
from app.repositories.group import GroupRepository

router = Router(name="admin_groups_list")


def render_group_admin_card(group: Group, language: Language) -> str:
    lines = [
        f"👥 {group.title or group.id} (ID {group.id})",
        f"lang={group.language.value}",
    ]
    lines.append(
        t("admin_group_auction_status_line", language,
          status=t("admin_group_status_on", language) if group.auction_enabled
          else t("admin_group_status_off", language))
    )
    if not group.is_active:
        lines.append(t("admin_group_inactive_label", language))
    return "\n".join(lines)


@router.callback_query(AdminMenuCallback.filter(F.section == "groups"))
async def on_open_groups_section(
    query: CallbackQuery, callback_data: AdminMenuCallback, ctx: RequestContext, state: FSMContext
) -> None:
    if not await require_permission(query, ctx, "groups"):
        return
    await state.clear()
    groups = await GroupRepository(ctx.session).list_all()
    title = t("admin_groups_title", ctx.language) if groups else t("admin_groups_empty", ctx.language)
    if query.message is not None:
        await query.message.edit_text(title, reply_markup=admin_groups_list_keyboard(ctx.language, groups))
    await query.answer()


@router.callback_query(AdminGroupCallback.filter(F.action == "view"))
async def on_view_group(query: CallbackQuery, callback_data: AdminGroupCallback, ctx: RequestContext) -> None:
    if not await require_permission(query, ctx, "groups"):
        return
    group = await GroupRepository(ctx.session).get(callback_data.group_id)
    if group is None:
        await query.answer(t("error_not_found", ctx.language), show_alert=True)
        return
    if query.message is not None:
        await query.message.edit_text(
            render_group_admin_card(group, ctx.language),
            reply_markup=admin_group_card_keyboard(ctx.language, group),
        )
    await query.answer()
