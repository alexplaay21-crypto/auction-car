"""Клавиатура экрана профиля."""
from __future__ import annotations

from aiogram.types import InlineKeyboardMarkup
from aiogram.utils.keyboard import InlineKeyboardBuilder

from app.callbacks.profile import ProfileCallback
from app.core.enums import Language
from app.localization.manager import t


def profile_keyboard(language: Language) -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    builder.button(text=t("daily_bonus_btn", language), callback_data=ProfileCallback(action="daily_bonus"))
    builder.button(text=t("settings_statistics", language), callback_data=ProfileCallback(action="statistics"))
    builder.adjust(1)
    return builder.as_markup()
