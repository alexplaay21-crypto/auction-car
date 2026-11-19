"""Определение 'области' комнаты для текущего чата: своя очередь комнат
для каждой группы и одна общая очередь для ЛС — 'механика группы и ЛС
одинаковая' (раздел 5 ТЗ)."""
from __future__ import annotations

from app.core.enums import RoomScope

PRIVATE_SCOPE_ID = 0


def resolve_scope(chat_type: str, chat_id: int) -> tuple[RoomScope, int]:
    if chat_type in ("group", "supergroup"):
        return RoomScope.GROUP, chat_id
    return RoomScope.PRIVATE, PRIVATE_SCOPE_ID
