"""CallbackData для покупки VIP."""
from __future__ import annotations

from aiogram.filters.callback_data import CallbackData


class VipCallback(CallbackData, prefix="vip"):
    action: str  # "buy"
