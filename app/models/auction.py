"""Один раунд аукциона = один контейнер в конкретной комнате.

Хранится полностью в PostgreSQL, чтобы после рестарта процесса/сервера
корректно восстановить: текущую ставку, лидера, оставшееся время, статус.
Redis (см. services/auctions/timer.py на этапе Auctions) держит только
вспомогательный таймер-джобу, а не источник истины."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import BigInteger, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import AuctionStatus
from app.database.base import Base, TimestampMixin


class Auction(Base, TimestampMixin):
    __tablename__ = "auctions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    room_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    container_id: Mapped[int] = mapped_column(
        ForeignKey("containers.id", ondelete="RESTRICT"), nullable=False
    )

    status: Mapped[AuctionStatus] = mapped_column(default=AuctionStatus.ACTIVE, nullable=False)

    initial_bid: Mapped[int] = mapped_column(BigInteger, nullable=False)
    current_bid: Mapped[int] = mapped_column(BigInteger, nullable=False)
    current_leader_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Источник истины для таймера — не полагаться только на Redis TTL.
    ends_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Результат: какая машина выпала (заполняется при открытии контейнера).
    result_car_id: Mapped[int | None] = mapped_column(
        ForeignKey("cars.id", ondelete="SET NULL"), nullable=True
    )
    # Владелец полученной машины в гараже (UserCar.id), для трассировки истории.
    result_user_car_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("user_cars.id", ondelete="SET NULL"), nullable=True
    )

    started_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
