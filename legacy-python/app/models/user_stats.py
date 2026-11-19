"""Агрегированная статистика игрока (для профиля/настроек и админки)."""
from __future__ import annotations

from sqlalchemy import BigInteger, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin


class UserStats(Base, TimestampMixin):
    __tablename__ = "user_stats"

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )

    containers_opened: Mapped[int] = mapped_column(default=0, nullable=False)
    bids_made: Mapped[int] = mapped_column(default=0, nullable=False)
    wins: Mapped[int] = mapped_column(default=0, nullable=False)
    cars_obtained: Mapped[int] = mapped_column(default=0, nullable=False)
    cars_sold: Mapped[int] = mapped_column(default=0, nullable=False)

    earned_total: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    spent_total: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    container_profit: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)

    referrals_count: Mapped[int] = mapped_column(default=0, nullable=False)
