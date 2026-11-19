"""Участник комнаты. missed_containers_streak считает подряд идущие контейнеры
без ставки от игрока — при достижении core.constants (KICK-порог, задаётся в
Setting) игрок кикается из комнаты."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin


class RoomMember(Base, TimestampMixin):
    __tablename__ = "room_members"
    __table_args__ = (UniqueConstraint("room_id", "user_id", name="uq_room_members_room_user"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    room_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    missed_containers_streak: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    left_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
