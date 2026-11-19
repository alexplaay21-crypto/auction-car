"""Раздел 'Документация' (раздел 27 ТЗ): как играть, контейнеры, аукцион,
гараж, редкости, VIP, рефералы, BP, магазин, правила и другие разделы —
произвольные section_key, без фиксированного списка."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery

from app.admin.permissions import require_permission
from app.callbacks.admin import AdminDocsCallback, AdminMenuCallback
from app.core.context import RequestContext
from app.core.enums import Language
from app.keyboards.admin import admin_docs_list_keyboard, admin_docs_section_keyboard
from app.localization.manager import t
from app.repositories.documentation import DocumentationRepository

router = Router(name="admin_docs_list")


@router.callback_query(AdminMenuCallback.filter(F.section == "documentation"))
async def on_open_docs_section(
    query: CallbackQuery, callback_data: AdminMenuCallback, ctx: RequestContext, state: FSMContext
) -> None:
    if not await require_permission(query, ctx, "documentation"):
        return
    await state.clear()
    pages = await DocumentationRepository(ctx.session).list_all_sections()
    keys = [p.section_key for p in pages]
    title = t("admin_docs_title", ctx.language) if keys else t("admin_docs_empty", ctx.language)
    if query.message is not None:
        await query.message.edit_text(title, reply_markup=admin_docs_list_keyboard(ctx.language, keys))
    await query.answer()


@router.callback_query(AdminDocsCallback.filter(F.action == "view"))
async def on_view_section(
    query: CallbackQuery, callback_data: AdminDocsCallback, ctx: RequestContext
) -> None:
    if not await require_permission(query, ctx, "documentation"):
        return
    repo = DocumentationRepository(ctx.session)
    page_ru = await repo.get_section(callback_data.section_key, Language.RU)
    page_en = await repo.get_section(callback_data.section_key, Language.EN)
    if page_ru is None and page_en is None:
        await query.answer(t("error_not_found", ctx.language), show_alert=True)
        return

    lines = [f"📖 {callback_data.section_key}", "", "RU:"]
    lines.append(f"{page_ru.title}\n{page_ru.content}" if page_ru else "—")
    lines += ["", "EN:"]
    lines.append(f"{page_en.title}\n{page_en.content}" if page_en else "—")

    if query.message is not None:
        await query.message.edit_text(
            "\n".join(lines), reply_markup=admin_docs_section_keyboard(ctx.language, callback_data.section_key)
        )
    await query.answer()
