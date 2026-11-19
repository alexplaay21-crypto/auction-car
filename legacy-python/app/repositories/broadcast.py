"""Доступ к рассылкам: Broadcast, BroadcastTarget."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import func, select, update

from app.core.enums import BroadcastStatus, DeliveryStatus
from app.models.broadcast import Broadcast
from app.models.broadcast_target import BroadcastTarget
from app.repositories.base import BaseRepository


class BroadcastRepository(BaseRepository[Broadcast]):
    model = Broadcast

    async def list_all(self, limit: int = 30) -> list[Broadcast]:
        stmt = select(Broadcast).order_by(Broadcast.id.desc()).limit(limit)
        return list((await self.session.execute(stmt)).scalars())

    async def create(self, **fields) -> Broadcast:
        broadcast = Broadcast(**fields)
        self.add(broadcast)
        await self.flush()
        return broadcast

    async def list_due(self, now: dt.datetime) -> list[Broadcast]:
        stmt = select(Broadcast).where(
            Broadcast.status == BroadcastStatus.SCHEDULED, Broadcast.scheduled_at <= now
        )
        return list((await self.session.execute(stmt)).scalars())

    async def set_status(self, broadcast_id: int, status: BroadcastStatus) -> None:
        await self.session.execute(
            update(Broadcast).where(Broadcast.id == broadcast_id).values(status=status)
        )

    async def update_fields(self, broadcast_id: int, **fields) -> None:
        if fields:
            await self.session.execute(update(Broadcast).where(Broadcast.id == broadcast_id).values(**fields))


class BroadcastTargetRepository(BaseRepository[BroadcastTarget]):
    model = BroadcastTarget

    async def bulk_add(self, broadcast_id: int, user_ids: list[int]) -> None:
        self.session.add_all(
            [BroadcastTarget(broadcast_id=broadcast_id, user_id=uid) for uid in user_ids]
        )

    async def clear_targets(self, broadcast_id: int) -> None:
        """Перед каждым новым раундом повторяющейся рассылки (раздел 25 ТЗ:
        ежедневная/еженедельная) список получателей формируется заново —
        старые записи этого broadcast_id удаляются, чтобы bulk_add() не
        упал на уникальности (broadcast_id, user_id) для тех же игроков."""
        stmt = select(BroadcastTarget).where(BroadcastTarget.broadcast_id == broadcast_id)
        for row in (await self.session.execute(stmt)).scalars():
            await self.delete(row)

    async def mark_sent(self, target_id: int, when: dt.datetime) -> None:
        await self.session.execute(
            update(BroadcastTarget)
            .where(BroadcastTarget.id == target_id)
            .values(status=DeliveryStatus.SENT, sent_at=when)
        )

    async def mark_failed(self, target_id: int, error: str) -> None:
        await self.session.execute(
            update(BroadcastTarget)
            .where(BroadcastTarget.id == target_id)
            .values(status=DeliveryStatus.FAILED, error=error)
        )

    async def list_pending(self, broadcast_id: int) -> list[BroadcastTarget]:
        stmt = select(BroadcastTarget).where(
            BroadcastTarget.broadcast_id == broadcast_id, BroadcastTarget.status == DeliveryStatus.PENDING
        )
        return list((await self.session.execute(stmt)).scalars())

    async def count_by_status(self, broadcast_id: int, status: DeliveryStatus) -> int:
        stmt = select(func.count()).select_from(BroadcastTarget).where(
            BroadcastTarget.broadcast_id == broadcast_id, BroadcastTarget.status == status
        )
        return (await self.session.execute(stmt)).scalar_one()
