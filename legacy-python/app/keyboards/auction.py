"""Клавиатуры раздела комнат/аукциона. В ЛС у комнаты — inline-кнопка
выхода (раздел 9 ТЗ); в группе она не показывается (there is no reply
keyboard concept for a shared chat, and leaving is per-player-only, so
DM-only keeps the group chat clean)."""
from __future__ import annotations

from aiogram.types import InlineKeyboardMarkup
from aiogram.utils.keyboard import InlineKeyboardBuilder

from app.callbacks.auction import RoomLeaveCallback
from app.core.enums import Language
from app.localization.manager import t


def room_keyboard(language: Language, room_id: int) -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    builder.button(text=t("leave_room_btn", language), callback_data=RoomLeaveCallback(room_id=room_id))
    builder.adjust(1)
    return builder.as_markup()
