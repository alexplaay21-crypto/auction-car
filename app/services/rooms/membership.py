"""Вступление/выход из комнаты.

Правила из раздела 5 ТЗ:
- В группе участвовать может только игрок этой группы.
- Максимум 30 игроков в комнате.
- Вторая комната появляется только после полного заполнения первой (и так далее).
- Игрок участвует только в той комнате, в которую он вошёл.

Вся операция — под distributed-локом на (scope, scope_id) и в одной
транзакции, чтобы одновременные вступления не переполнили комнату сверх
лимита и не создали две "следующие" комнаты одновременно."""
from __future__ import annotations

import datetime as dt

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import MAX_PLAYERS_PER_ROOM
from app.core.enums import RoomScope
from app.core.exceptions import AppError
from app.database.transaction import atomic, distributed_lock
from app.localization.manager import t
from app.models.room import Room
from app.models.user import User
from app.repositories.group import GroupMemberRepository, GroupRepository
from app.repositories.room import RoomMemberRepository, RoomRepository
from app.services.rooms.service import RoomService


class RoomMembershipService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.room_service = RoomService(session)

    async def join_current_room(self, user: User, scope: RoomScope, scope_id: int) -> Room:
        if scope is RoomScope.GROUP:
            group = await GroupRepository(self.session).get(scope_id)
            if group is None or not group.is_active or not group.auction_enabled:
                raise AppError(t("group_auction_disabled", user.language))
            is_member = await GroupMemberRepository(self.session).is_member(scope_id, user.id)
            if not is_member:
                raise AppError(t("error_permission_denied", user.language))

        async with distributed_lock(f"room_join:{scope.value}:{scope_id}"):
            async with atomic(self.session):
                room_repo = RoomRepository(self.session)
                member_repo = RoomMemberRepository(self.session)

                room = await self.room_service.get_or_open_room(scope, scope_id)
                existing = await member_repo.get_member(room.id, user.id)

                if existing is not None and existing.left_at is None:
                    return room  # уже активный участник — идемпотентно

                count = await member_repo.count_members(room.id)
                if count >= room.max_players:
                    # Комнату заполнили, пока мы её проверяли, — открываем следующую.
                    await room_repo.mark_full(room.id)
                    room = await room_repo.create_room(scope, scope_id, MAX_PLAYERS_PER_ROOM)
                    existing = None
                    count = 0

                if existing is not None:
                    await member_repo.rejoin(room.id, user.id)
                else:
                    await member_repo.add_member(room.id, user.id)

                if count + 1 >= room.max_players:
                    await room_repo.mark_full(room.id)

        return room

    async def leave_room(self, user_id: int, room_id: int) -> None:
        await RoomMemberRepository(self.session).mark_left(
            room_id, user_id, dt.datetime.now(dt.timezone.utc)
        )

    async def room_status(self, room: Room) -> tuple[int, int]:
        """(текущее число активных участников, вместимость)."""
        count = await RoomMemberRepository(self.session).count_members(room.id)
        return count, room.max_players
