"""Клавиатура предложения продажи машины покупателю."""
from __future__ import annotations

from aiogram.types import InlineKeyboardMarkup
from aiogram.utils.keyboard import InlineKeyboardBuilder

from app.callbacks.economy import SaleOfferCallback
from app.core.enums import Language
from app.localization.manager import t


def sale_offer_keyboard(language: Language, sale_id: int) -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    builder.button(
        text=t("sell_player_buy_btn", language),
        callback_data=SaleOfferCallback(sale_id=sale_id, action="accept"),
    )
    builder.button(
        text=t("sell_player_decline_btn", language),
        callback_data=SaleOfferCallback(sale_id=sale_id, action="decline"),
    )
    builder.adjust(2)
    return builder.as_markup()
