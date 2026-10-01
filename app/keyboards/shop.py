"""Клавиатура магазина: одна кнопка «Купить» на лот."""
from __future__ import annotations

from aiogram.types import InlineKeyboardMarkup
from aiogram.utils.keyboard import InlineKeyboardBuilder

from app.callbacks.shop import ShopCallback
from app.models.shop_lot import ShopLot


def shop_keyboard(lots: list[ShopLot]) -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    for lot in lots:
        builder.button(text=f"{lot.title} — {lot.price}", callback_data=ShopCallback(lot_id=lot.id))
    builder.adjust(1)
    return builder.as_markup()
