"""Универсальный журнал событий — полная история игрока и действий админов
(ставки, выигрыши, продажи, покупки, переводы, рефералы, бонусы, промокоды,
BP, VIP, действия администраторов и т.д.). Каждое событие — дата/время +
operation_id (если применимо)."""
from __future__ import annotations

from sqlalchemy import BigInteger, ForeignKey, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin


class HistoryEvent(Base, TimestampMixin):
    __tablename__ = "history_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    user_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Для действий администратора над чужим аккаунтом.
    actor_admin_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)

    operation_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
