"""Выбор языка: и в онбординге (шаг 1 первого запуска), и в Настройках
(смена языка в любой момент — context='settings')."""
from __future__ import annotations

from aiogram import Router
from aiogram.types import CallbackQuery

from app.callbacks.common import LanguageCallback
from app.core.context import RequestContext
from app.core.enums import Language
from app.handlers.common.documentation import show_documentation_intro
from app.localization.manager import t
from app.repositories.user import UserRepository

router = Router(name="common_language")


@router.callback_query(LanguageCallback.filter())
async def on_language_chosen(
    query: CallbackQuery, callback_data: LanguageCallback, ctx: RequestContext
) -> None:
    language = Language(callback_data.code)

    await UserRepository(ctx.session).set_language(ctx.user.id, language)
    ctx.user.language = language
    ctx.language = language

    if callback_data.context == "onboarding":
        await show_documentation_intro(query, language)
    else:
        if query.message is not None:
            await query.message.edit_text(t("settings_language", language))

    await query.answer()
