"""CallbackData для раздела комнат/аукциона."""
from __future__ import annotations

from aiogram.filters.callback_data import CallbackData


class RoomLeaveCallback(CallbackData, prefix="room_leave"):
    room_id: int
