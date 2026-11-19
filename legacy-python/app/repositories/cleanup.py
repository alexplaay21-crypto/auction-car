"""Массовое удаление/закрытие устаревших служебных данных (раздел 1 ТЗ:
автоочистка раз в 24 часа). Игровая история (ledger, history_events кроме
системных ошибок, ставки, аукционы) НЕ удаляется."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import delete, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import DeliveryStatus, OperationStatus, SaleStatus
from app.models.broadcast_target import BroadcastTarget
from app.models.history import HistoryEvent
from app.models.operation import Operation
from app.models.room_member import RoomMember
from app.models.sale import Sale


class CleanupRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def delete_old_operations(self, before: dt.datetime) -> int:
        stmt = delete(Operation).where(
            Operation.status.in_([OperationStatus.COMPLETED, OperationStatus.FAILED]),
            Operation.created_at < before,
        )
        return (await self.session.execute(stmt)).rowcount or 0

    async def delete_old_broadcast_targets(self, before: dt.datetime) -> int:
        stmt = delete(BroadcastTarget).where(
            BroadcastTarget.status != DeliveryStatus.PENDING, BroadcastTarget.created_at < before
        )
        return (await self.session.execute(stmt)).rowcount or 0

    async def delete_old_system_errors(self, before: dt.datetime) -> int:
        stmt = delete(HistoryEvent).where(
            HistoryEvent.event_type == "system_error", HistoryEvent.created_at < before
        )
        return (await self.session.execute(stmt)).rowcount or 0

    async def expire_old_sale_offers(self, before: dt.datetime, now: dt.datetime) -> int:
        stmt = (
            update(Sale)
            .where(Sale.status == SaleStatus.PENDING, Sale.created_at < before)
            .values(status=SaleStatus.EXPIRED, resolved_at=now)
        )
        return (await self.session.execute(stmt)).rowcount or 0

    async def delete_old_room_members(self, before: dt.datetime) -> int:
        stmt = delete(RoomMember).where(RoomMember.left_at.is_not(None), RoomMember.left_at < before)
        return (await self.session.execute(stmt)).rowcount or 0
