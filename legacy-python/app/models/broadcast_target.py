"""Статус доставки рассылки каждому получателю — нужен для статистики
(сколько отправлено/провалилось) и чтобы не отправить повторно."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import BigInteger, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import DeliveryStatus
from app.database.base import Base, TimestampMixin


class BroadcastTarget(Base, TimestampMixin):
    __tablename__ = "broadcast_targets"
    __table_args__ = (
        UniqueConstraint("broadcast_id", "user_id", name="uq_broadcast_targets_broadcast_user"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    broadcast_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("broadcasts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[DeliveryStatus] = mapped_column(default=DeliveryStatus.PENDING, nullable=False)
    sent_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error: Mapped[str | None] = mapped_column(nullable=True)
