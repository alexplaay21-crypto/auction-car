"""Прогресс игрока по конкретному BP. current_level растёт максимум на 1
за игровой день (00:00 UTC), при условии что игрок открыл >=1 контейнер."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin


class BattlePassProgress(Base, TimestampMixin):
    __tablename__ = "battle_pass_progress"
    __table_args__ = (
        UniqueConstraint("user_id", "battle_pass_id", name="uq_bp_progress_user_bp"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    battle_pass_id: Mapped[int] = mapped_column(
        ForeignKey("battle_passes.id", ondelete="CASCADE"), nullable=False, index=True
    )

    purchased_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    current_level: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    claimed_level: Mapped[int] = mapped_column(default=0, server_default="0", nullable=False)
    last_level_up_date: Mapped[dt.date | None] = mapped_column(nullable=True)
    opened_container_today: Mapped[bool] = mapped_column(default=False, nullable=False)
