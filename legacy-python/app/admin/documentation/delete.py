"""Удаление раздела документации (обе языковые версии)."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.types import CallbackQuery

from app.admin.permissions import require_permission
from app.callbacks.admin import AdminDocsCallback, AdminMenuCallback
from app.core.context import RequestContext
from app.localization.manager import t
from app.repositories.documentation import DocumentationRepository

router = Router(name="admin_docs_delete")


@router.callback_query(AdminDocsCallback.filter(F.action == "delete"))
async def on_delete_section(
    query: CallbackQuery, callback_data: AdminDocsCallback, ctx: RequestContext
) -> None:
    if not await require_permission(query, ctx, "documentation"):
        return
    await DocumentationRepository(ctx.session).delete_section(callback_data.section_key)
    await query.answer(t("admin_action_done", ctx.language))
    if query.message is not None:
        await query.message.edit_text(t("admin_docs_deleted", ctx.language))
