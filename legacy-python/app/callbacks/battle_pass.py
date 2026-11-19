"""CallbackData для покупки Battle Pass."""
from __future__ import annotations

from aiogram.filters.callback_data import CallbackData


class BattlePassCallback(CallbackData, prefix="bp"):
    action: str  # "buy"


class BattlePassPageCallback(CallbackData, prefix="bppage"):
    page: int = 1
