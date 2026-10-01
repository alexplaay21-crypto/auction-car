"""Клавиатура покупки VIP."""
from __future__ import annotations

from aiogram.types import InlineKeyboardMarkup
from aiogram.utils.keyboard import InlineKeyboardBuilder

from app.callbacks.vip import VipCallback
from app.core.enums import Language
from app.localization.manager import t


def vip_purchase_keyboard(language: Language) -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    builder.button(text=t("vip_buy_btn", language), callback_data=VipCallback(action="buy"))
    builder.adjust(1)
    return builder.as_markup()
