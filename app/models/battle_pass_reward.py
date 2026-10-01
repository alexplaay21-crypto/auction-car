"""Один уровень BP может содержать несколько наград (несколько строк)."""
from __future__ import annotations

from sqlalchemy import ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import RewardType
from app.database.base import Base, TimestampMixin


class BattlePassReward(Base, TimestampMixin):
    __tablename__ = "battle_pass_rewards"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    level_id: Mapped[int] = mapped_column(
        ForeignKey("battle_pass_levels.id", ondelete="CASCADE"), nullable=False, index=True
    )
    reward_type: Mapped[RewardType] = mapped_column(nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)  # напр. {"amount": 5000} / {"car_id": 12}
