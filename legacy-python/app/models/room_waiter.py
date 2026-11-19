"""Игроки, ожидающие окончания текущего аукциона перед входом в комнату."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import BigInteger, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin


class RoomWaiter(Base, TimestampMixin):
    __tablename__ = "room_waiters"
    __table_args__ = (
        UniqueConstraint(
            "scope",
            "scope_id",
            "user_id",
            name="uq_room_waiters_scope_user",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    scope: Mapped[str] = mapped_column(nullable=False, index=True)
    scope_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    joined_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
