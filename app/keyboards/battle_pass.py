"""Клавиатура покупки Battle Pass."""
from __future__ import annotations

from aiogram.types import InlineKeyboardMarkup
from aiogram.utils.keyboard import InlineKeyboardBuilder

from app.callbacks.battle_pass import BattlePassCallback
from app.core.enums import Language
from app.localization.manager import t


def battle_pass_keyboard(language: Language) -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    builder.button(text=t("bp_offer_buy_btn", language), callback_data=BattlePassCallback(action="buy"))
    builder.adjust(1)
    return builder.as_markup()
