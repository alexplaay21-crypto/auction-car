"""Доступ к универсальному журналу событий: HistoryEvent."""
from __future__ import annotations

from sqlalchemy import func, select

from app.models.history import HistoryEvent
from app.repositories.base import BaseRepository


def record_event(
    session, user_id: int | None, event_type: str, payload: dict | None = None,
    operation_id: str | None = None, actor_admin_id: int | None = None,
) -> None:
    """Добавляет событие в журнал в ТОЙ ЖЕ транзакции, что и сама операция:
    если операция откатилась — откатится и запись (в истории не бывает
    событий, которых не было). Не делает flush/commit и ничего не читает."""
    session.add(
        HistoryEvent(
            user_id=user_id, event_type=event_type, payload=payload or {},
            operation_id=operation_id, actor_admin_id=actor_admin_id,
        )
    )


class HistoryRepository(BaseRepository[HistoryEvent]):
    model = HistoryEvent

    async def add_event(
        self, user_id: int | None, event_type: str, payload: dict,
        operation_id: str | None = None, actor_admin_id: int | None = None,
    ) -> HistoryEvent:
        event = HistoryEvent(
            user_id=user_id, event_type=event_type, payload=payload,
            operation_id=operation_id, actor_admin_id=actor_admin_id,
        )
        self.add(event)
        return event

    async def list_for_user(self, user_id: int, limit: int = 50, offset: int = 0) -> list[HistoryEvent]:
        stmt = (
            select(HistoryEvent)
            .where(HistoryEvent.user_id == user_id)
            .order_by(HistoryEvent.id.desc())
            .limit(limit)
            .offset(offset)
        )
        return list((await self.session.execute(stmt)).scalars())

    async def count_for_user(self, user_id: int) -> int:
        stmt = select(func.count(HistoryEvent.id)).where(HistoryEvent.user_id == user_id)
        return int((await self.session.execute(stmt)).scalar() or 0)

    async def list_by_type(self, event_type: str, limit: int = 100) -> list[HistoryEvent]:
        stmt = (
            select(HistoryEvent)
            .where(HistoryEvent.event_type == event_type)
            .order_by(HistoryEvent.id.desc())
            .limit(limit)
        )
        return list((await self.session.execute(stmt)).scalars())
