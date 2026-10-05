"""Вступление/выход из комнаты."""
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
from app.repositories.auction import AuctionRepository
from app.repositories.group import GroupMemberRepository, GroupRepository
from app.repositories.room import RoomMemberRepository, RoomRepository
from app.repositories.room_waiter import RoomWaiterRepository
from app.services.rooms.service import RoomService


class RoomMembershipService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.room_service = RoomService(session)

    async def join_current_room(
        self,
        user: User,
        scope: RoomScope,
        scope_id: int,
    ) -> Room | None:
        if scope is RoomScope.GROUP:
            group = await GroupRepository(self.session).get(scope_id)
            if group is None or not group.is_active or not group.auction_enabled:
                raise AppError(t("group_auction_disabled", user.language))

            is_member = await GroupMemberRepository(self.session).is_member(
                scope_id,
                user.id,
            )
            if not is_member:
                raise AppError(t("error_permission_denied", user.language))

        async with distributed_lock(f"room_join:{scope.value}:{scope_id}"):
            async with atomic(self.session):
                room_repo = RoomRepository(self.session)
                member_repo = RoomMemberRepository(self.session)
                waiter_repo = RoomWaiterRepository(self.session)
                auction_repo = AuctionRepository(self.session)

                # Сначала ищем последнюю незакрытую комнату.
                # Это важно: если она FULL и в ней идёт аукцион,
                # новую комнату создавать пока нельзя.
                room = await room_repo.get_latest_active_room(
                    scope,
                    scope_id,
                )

                # Если комнат вообще нет — создаём первую.
                if room is None:
                    room = await room_repo.create_room(
                        scope,
                        scope_id,
                        MAX_PLAYERS_PER_ROOM,
                    )

                existing = await member_repo.get_member(room.id, user.id)

                if existing is not None and existing.left_at is None:
                    return room

                # Если в текущей комнате идёт аукцион — ждём его окончания.
                # Даже если комната уже FULL, новую комнату здесь НЕ создаём.
                active_auction = await auction_repo.get_active_for_room(room.id)

                if active_auction is not None:
                    await waiter_repo.add(
                        scope.value,
                        scope_id,
                        user.id,
                    )
                    return None

                count = await member_repo.count_members(room.id)

                # Комната заполнена и аукциона уже нет —
                # теперь можно открыть следующую.
                if count >= room.max_players:
                    await room_repo.mark_full(room.id)

                    room = await room_repo.create_room(
                        scope,
                        scope_id,
                        MAX_PLAYERS_PER_ROOM,
                    )

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
            room_id,
            user_id,
            dt.datetime.now(dt.timezone.utc),
        )

    async def room_status(self, room: Room) -> tuple[int, int]:
        count = await RoomMemberRepository(self.session).count_members(room.id)
        return count, room.max_players
