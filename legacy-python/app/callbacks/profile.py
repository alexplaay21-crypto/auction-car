"""CallbackData для экрана профиля."""
from __future__ import annotations

from aiogram.filters.callback_data import CallbackData


class ProfileCallback(CallbackData, prefix="profile"):
    action: str  # "daily_bonus" | "statistics"
