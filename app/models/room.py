"""Комната аукциона. Максимум 30 игроков (core.constants.MAX_PLAYERS_PER_ROOM).
Новая комната появляется только после заполнения предыдущей — нумерация
идёт по (scope, scope_id)."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import RoomScope, RoomStatus
from app.database.base import Base, TimestampMixin


class Room(Base, TimestampMixin):
    __tablename__ = "rooms"
    __table_args__ = (
        UniqueConstraint("scope", "scope_id", "room_number", name="uq_rooms_scope_number"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    scope: Mapped[RoomScope] = mapped_column(nullable=False)
    # Для scope=GROUP — id группы; для scope=PRIVATE — 0 (единая очередь ЛС).
    scope_id: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    room_number: Mapped[int] = mapped_column(Integer, nullable=False)

    status: Mapped[RoomStatus] = mapped_column(default=RoomStatus.OPEN, nullable=False)
    max_players: Mapped[int] = mapped_column(Integer, default=30, nullable=False)

    # /stop был вызван — после завершения текущего контейнера новые не создаются.
    stop_requested: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    closed_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
