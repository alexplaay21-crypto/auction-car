"""Комнаты аукциона: получение текущей открытой комнаты или создание первой
для данной области (раздел 5 ТЗ). Лимит игроков и переход к следующей
комнате — в services/rooms/membership.py (там, где меняется состав)."""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import MAX_PLAYERS_PER_ROOM
from app.core.enums import RoomScope
from app.models.room import Room
from app.repositories.room import RoomRepository


class RoomService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_or_open_room(self, scope: RoomScope, scope_id: int) -> Room:
        repo = RoomRepository(self.session)
        room = await repo.get_open_room(scope, scope_id)
        if room is None:
            room = await repo.create_room(scope, scope_id, MAX_PLAYERS_PER_ROOM)
        return room
