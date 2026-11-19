"""Общие inline-клавиатуры онбординга: выбор языка, согласие с документацией."""
from __future__ import annotations

from aiogram.types import InlineKeyboardMarkup
from aiogram.utils.keyboard import InlineKeyboardBuilder

from app.callbacks.common import DocsCallback, LanguageCallback
from app.core.enums import Language
from app.localization.manager import t


def language_keyboard(context: str) -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    builder.button(text="🇷🇺 Русский", callback_data=LanguageCallback(code="ru", context=context))
    builder.button(text="🇬🇧 English", callback_data=LanguageCallback(code="en", context=context))
    builder.adjust(2)
    return builder.as_markup()


def docs_agree_keyboard(language: Language) -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    builder.button(text=t("docs_agree_btn", language), callback_data=DocsCallback(action="agree"))
    builder.adjust(1)
    return builder.as_markup()
