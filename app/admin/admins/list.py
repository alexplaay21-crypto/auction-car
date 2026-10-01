"""Раздел 'Администраторы' (разделы 2, 27 ТЗ). Просмотр списка доступен по
праву 'admins', но назначать и снимать администраторов может только
владелец бота — так прямо сказано в ТЗ ('Владелец назначает и снимает
администраторов непосредственно через бота')."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery

from app.admin.permissions import require_permission
from app.callbacks.admin import AdminMenuCallback
from app.core.context import RequestContext
from app.keyboards.admin import admin_admins_list_keyboard
from app.localization.manager import t
from app.repositories.user import AdminRepository, UserRepository

router = Router(name="admin_admins_list")


async def render_admins(ctx: RequestContext) -> tuple[str, list[tuple[int, str]]]:
    admins = await AdminRepository(ctx.session).list_active()
    user_repo = UserRepository(ctx.session)

    lines = [t("admin_admins_title", ctx.language)]
    if not admins:
        lines.append(t("admin_admins_empty", ctx.language))

    rows: list[tuple[int, str]] = []
    for admin in admins:
        user = await user_repo.get(admin.user_id)
        label = f"@{user.username}" if user and user.username else str(admin.user_id)
        perms = ", ".join(key for key, value in admin.permissions.items() if value) or "—"
        lines.append(f"{label} — {perms}")
        rows.append((admin.user_id, label))

    return "\n".join(lines), rows


@router.callback_query(AdminMenuCallback.filter(F.section == "admins"))
async def on_open_admins_section(
    query: CallbackQuery, callback_data: AdminMenuCallback, ctx: RequestContext, state: FSMContext
) -> None:
    if not await require_permission(query, ctx, "admins"):
        return
    await state.clear()
    text, rows = await render_admins(ctx)
    if query.message is not None:
        await query.message.edit_text(text, reply_markup=admin_admins_list_keyboard(ctx.language, rows))
    await query.answer()
