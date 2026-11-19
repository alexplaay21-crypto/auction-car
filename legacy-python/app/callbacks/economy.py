"""CallbackData для раздела экономики: принять/отклонить предложение
продажи машины другому игроку (раздел 15 ТЗ)."""
from __future__ import annotations

from aiogram.filters.callback_data import CallbackData


class SaleOfferCallback(CallbackData, prefix="sale_offer"):
    sale_id: int
    action: str  # "accept" | "decline"
