from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin


class BattlePassLevel(Base, TimestampMixin):
    __tablename__ = "battle_pass_levels"
    __table_args__ = (
        UniqueConstraint("battle_pass_id", "level_number", name="uq_bp_level_number"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    battle_pass_id: Mapped[int] = mapped_column(
        ForeignKey("battle_passes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    level_number: Mapped[int] = mapped_column(Integer, nullable=False)
