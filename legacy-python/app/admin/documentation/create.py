"""Создание/правка раздела документации — сразу для RU и EN одним
сообщением, чтобы переводы не могли разойтись по смыслу (ТЗ: 'перевод на
двух языках должен быть одинаковым'). Формат:
  Заголовок RU | Текст RU ||| Заголовок EN | Текст EN"""
from __future__ import annotations

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.admin.permissions import require_permission
from app.callbacks.admin import AdminDocsCallback
from app.core.context import RequestContext
from app.core.enums import Language
from app.core.exceptions import AppError
from app.localization.manager import t
from app.repositories.documentation import DocumentationRepository
from app.states.admin_documentation import AdminDocumentationStates

router = Router(name="admin_docs_create")


def parse_docs_content(text: str) -> tuple[str, str, str, str]:
    ru_part, sep, en_part = text.partition("|||")
    if not sep:
        raise ValueError("format")
    ru_title, _, ru_content = ru_part.partition("|")
    en_title, _, en_content = en_part.partition("|")
    ru_title, ru_content = ru_title.strip(), ru_content.strip()
    en_title, en_content = en_title.strip(), en_content.strip()
    if not all((ru_title, ru_content, en_title, en_content)):
        raise ValueError("format")
    return ru_title, ru_content, en_title, en_content


@router.callback_query(AdminDocsCallback.filter(F.action == "create"))
async def on_create_prompt(
    query: CallbackQuery, callback_data: AdminDocsCallback, ctx: RequestContext, state: FSMContext
) -> None:
    if not await require_permission(query, ctx, "documentation"):
        return
    await state.set_state(AdminDocumentationStates.waiting_for_section_key)
    if query.message is not None:
        await query.message.answer(t("admin_docs_key_prompt", ctx.language))
    await query.answer()


@router.callback_query(AdminDocsCallback.filter(F.action == "edit"))
async def on_edit_prompt(
    query: CallbackQuery, callback_data: AdminDocsCallback, ctx: RequestContext, state: FSMContext
) -> None:
    if not await require_permission(query, ctx, "documentation"):
        return
    await state.update_data(admin_docs_section_key=callback_data.section_key)
    await state.set_state(AdminDocumentationStates.waiting_for_content)
    if query.message is not None:
        await query.message.answer(t("admin_docs_content_prompt", ctx.language))
    await query.answer()


@router.message(AdminDocumentationStates.waiting_for_section_key)
async def on_section_key(message: Message, ctx: RequestContext, state: FSMContext) -> None:
    key = (message.text or "").strip().lower().replace(" ", "_")
    if not key:
        raise AppError(t("admin_format_invalid", ctx.language))
    await state.update_data(admin_docs_section_key=key)
    await state.set_state(AdminDocumentationStates.waiting_for_content)
    await message.answer(t("admin_docs_content_prompt", ctx.language))


@router.message(AdminDocumentationStates.waiting_for_content)
async def on_content(message: Message, ctx: RequestContext, state: FSMContext) -> None:
    data = await state.get_data()
    section_key = data.get("admin_docs_section_key")
    try:
        ru_title, ru_content, en_title, en_content = parse_docs_content(message.text or "")
    except ValueError as exc:
        raise AppError(t("admin_docs_format_invalid", ctx.language)) from exc
    if section_key is None:
        raise AppError(t("admin_format_invalid", ctx.language))

    repo = DocumentationRepository(ctx.session)
    await repo.upsert(section_key, Language.RU, ru_title, ru_content, ctx.user.id)
    await repo.upsert(section_key, Language.EN, en_title, en_content, ctx.user.id)
    await state.clear()

    await message.answer(t("admin_docs_saved", ctx.language, section_key=section_key))
