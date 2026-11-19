from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.room_waiter import RoomWaiter


class RoomWaiterRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(
        self,
        scope: str,
        scope_id: int,
        user_id: int,
    ) -> RoomWaiter | None:
        result = await self.session.execute(
            select(RoomWaiter).where(
                RoomWaiter.scope == scope,
                RoomWaiter.scope_id == scope_id,
                RoomWaiter.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    async def add(
        self,
        scope: str,
        scope_id: int,
        user_id: int,
    ) -> RoomWaiter:
        existing = await self.get(scope, scope_id, user_id)
        if existing is not None:
            return existing

        waiter = RoomWaiter(
            scope=scope,
            scope_id=scope_id,
            user_id=user_id,
        )
        self.session.add(waiter)
        await self.session.flush()
        return waiter

    async def list_for_scope(
        self,
        scope: str,
        scope_id: int,
    ) -> list[RoomWaiter]:
        result = await self.session.execute(
            select(RoomWaiter)
            .where(
                RoomWaiter.scope == scope,
                RoomWaiter.scope_id == scope_id,
            )
            .order_by(RoomWaiter.joined_at.asc(), RoomWaiter.id.asc())
        )
        return list(result.scalars().all())

    async def remove(self, waiter_id: int) -> None:
        await self.session.execute(
            delete(RoomWaiter).where(RoomWaiter.id == waiter_id)
        )
