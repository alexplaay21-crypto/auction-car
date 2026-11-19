"""Экспорт: полный .dump (тот же формат, что у авто-копий). Только владелец."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.types import CallbackQuery, FSInputFile

from app.callbacks.admin import AdminDatabaseCallback, AdminMenuCallback
from app.core.context import RequestContext
from app.keyboards.admin import admin_database_keyboard
from app.localization.manager import t
from app.services.backups.service import run_backup

router = Router(name="admin_database_export")


@router.callback_query(AdminMenuCallback.filter(F.section == "database"))
async def on_open_database_section(query: CallbackQuery, callback_data: AdminMenuCallback, ctx: RequestContext) -> None:
    if not ctx.is_owner:
        await query.answer("Только владелец", show_alert=True)
        return
    if query.message is not None:
        await query.message.edit_text(
            "💾 <b>База данных</b>\n\n📤 Скачать — свежая полная копия (.dump)\n📥 Восстановить — из такого же файла",
            reply_markup=admin_database_keyboard(ctx.language), parse_mode="HTML")
    await query.answer()


@router.callback_query(AdminDatabaseCallback.filter(F.action == "export"))
async def on_export(query: CallbackQuery, callback_data: AdminDatabaseCallback, ctx: RequestContext) -> None:
    if not ctx.is_owner:
        await query.answer("Только владелец", show_alert=True)
        return
    await query.answer("Создаю копию…")
    path = await run_backup(query.bot, updated_by=ctx.user.id)
    if query.message is not None:
        await query.message.answer_document(FSInputFile(path), caption="💾 Полная копия базы (.dump)")
