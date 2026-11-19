"""CallbackData для покупки лота магазина."""
from __future__ import annotations

from aiogram.filters.callback_data import CallbackData


class ShopCallback(CallbackData, prefix="shop"):
    lot_id: int
