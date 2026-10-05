"""Доступ к данным комнат аукциона: Room, RoomMember."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import func, select, update

from app.core.enums import RoomScope, RoomStatus
from app.models.room import Room
from app.models.room_member import RoomMember
from app.repositories.base import BaseRepository


class RoomRepository(BaseRepository[Room]):
    model = Room

    async def get_latest_active_room(
        self,
        scope: RoomScope,
        scope_id: int,
    ) -> Room | None:
        result = await self.session.execute(
            select(Room)
            .where(
                Room.scope == scope,
                Room.scope_id == scope_id,
                Room.status != RoomStatus.CLOSED,
            )
            .order_by(Room.room_number.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def get_open_room(self, scope: RoomScope, scope_id: int) -> Room | None:
        stmt = (
            select(Room)
            .where(Room.scope == scope, Room.scope_id == scope_id, Room.status == RoomStatus.OPEN)
            .order_by(Room.room_number.desc())
            .limit(1)
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def next_room_number(self, scope: RoomScope, scope_id: int) -> int:
        stmt = select(func.max(Room.room_number)).where(Room.scope == scope, Room.scope_id == scope_id)
        current_max = (await self.session.execute(stmt)).scalar_one_or_none()
        return (current_max or 0) + 1

    async def create_room(self, scope: RoomScope, scope_id: int, max_players: int) -> Room:
        room = Room(
            scope=scope,
            scope_id=scope_id,
            room_number=await self.next_room_number(scope, scope_id),
            status=RoomStatus.OPEN,
            max_players=max_players,
        )
        self.add(room)
        await self.flush()
        return room

    async def mark_full(self, room_id: int) -> None:
        await self.session.execute(update(Room).where(Room.id == room_id).values(status=RoomStatus.FULL))

    async def mark_closed(self, room_id: int, when: dt.datetime) -> None:
        await self.session.execute(
            update(Room).where(Room.id == room_id).values(status=RoomStatus.CLOSED, closed_at=when)
        )

    async def request_stop(self, room_id: int) -> None:
        await self.session.execute(update(Room).where(Room.id == room_id).values(stop_requested=True))

    async def request_stop_for_scope(self, scope: RoomScope, scope_id: int) -> None:
        """/stop для всех незакрытых комнат области (например, бота убрали из
        группы): текущие контейнеры доиграют, новые не запустятся."""
        await self.session.execute(
            update(Room)
            .where(Room.scope == scope, Room.scope_id == scope_id, Room.status != RoomStatus.CLOSED)
            .values(stop_requested=True)
        )

    async def find_active_room_for_user(
        self, user_id: int, scope: RoomScope, scope_id: int
    ) -> Room | None:
        """Комната этой области (группа/ЛС), в которую игрок реально вошёл и
        из которой ещё не вышел — 'игрок участвует только в той комнате, в
        которую он вошёл' (раздел 5 ТЗ). Может отличаться от комнаты,
        которая сейчас открыта для НОВЫХ вступлений, если эта уже заполнена."""
        stmt = (
            select(Room)
            .join(RoomMember, RoomMember.room_id == Room.id)
            .where(
                RoomMember.user_id == user_id,
                RoomMember.left_at.is_(None),
                Room.scope == scope,
                Room.scope_id == scope_id,
                Room.status != RoomStatus.CLOSED,
            )
            .order_by(Room.id.desc())
            .limit(1)
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()


class RoomMemberRepository(BaseRepository[RoomMember]):
    model = RoomMember

    async def get_member(self, room_id: int, user_id: int) -> RoomMember | None:
        stmt = select(RoomMember).where(RoomMember.room_id == room_id, RoomMember.user_id == user_id)
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def add_member(self, room_id: int, user_id: int) -> RoomMember:
        member = RoomMember(room_id=room_id, user_id=user_id)
        self.add(member)
        return member

    async def count_members(self, room_id: int) -> int:
        stmt = select(func.count()).select_from(RoomMember).where(
            RoomMember.room_id == room_id, RoomMember.left_at.is_(None)
        )
        return (await self.session.execute(stmt)).scalar_one()

    async def list_active_members(self, room_id: int) -> list[RoomMember]:
        stmt = select(RoomMember).where(RoomMember.room_id == room_id, RoomMember.left_at.is_(None))
        return list((await self.session.execute(stmt)).scalars())

    async def increment_missed(self, room_id: int, user_id: int) -> int:
        stmt = (
            update(RoomMember)
            .where(RoomMember.room_id == room_id, RoomMember.user_id == user_id)
            .values(missed_containers_streak=RoomMember.missed_containers_streak + 1)
            .returning(RoomMember.missed_containers_streak)
        )
        return (await self.session.execute(stmt)).scalar_one()

    async def reset_missed(self, room_id: int, user_id: int) -> None:
        await self.session.execute(
            update(RoomMember)
            .where(RoomMember.room_id == room_id, RoomMember.user_id == user_id)
            .values(missed_containers_streak=0)
        )

    async def rejoin(self, room_id: int, user_id: int) -> None:
        """Игрок ранее покинул эту же (всё ещё открытую) комнату и заходит
        снова — снимаем left_at и сбрасываем счётчик пропущенных контейнеров."""
        await self.session.execute(
            update(RoomMember)
            .where(RoomMember.room_id == room_id, RoomMember.user_id == user_id)
            .values(left_at=None, missed_containers_streak=0)
        )

    async def mark_left(self, room_id: int, user_id: int, when: dt.datetime) -> None:
        await self.session.execute(
            update(RoomMember)
            .where(RoomMember.room_id == room_id, RoomMember.user_id == user_id)
            .values(left_at=when)
        )
