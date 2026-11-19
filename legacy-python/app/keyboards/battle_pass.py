from __future__ import annotations

from aiogram.types import InlineKeyboardMarkup
from aiogram.utils.keyboard import InlineKeyboardBuilder

from app.callbacks.battle_pass import BattlePassCallback


def battle_pass_keyboard(price: int | None = None, claimable: int = 0) -> InlineKeyboardMarkup | None:
    b = InlineKeyboardBuilder()
    if price is not None:
        b.button(text=f"⭐ Купить Battle Pass · {price} Stars", callback_data=BattlePassCallback(action="buy"))
    if claimable:
        b.button(text=f"🎁 Забрать награды ({claimable})", callback_data=BattlePassCallback(action="claim"))
    b.adjust(1)
    return b.as_markup() if (price is not None or claimable) else None
