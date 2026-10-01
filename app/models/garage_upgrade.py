"""Тарифы расширения гаража — полностью редактируются в админке."""
from __future__ import annotations

from sqlalchemy import BigInteger, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin


class GarageUpgradeTier(Base, TimestampMixin):
    __tablename__ = "garage_upgrade_tiers"
    __table_args__ = (UniqueConstraint("new_capacity", name="uq_garage_upgrade_capacity"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    new_capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    price: Mapped[int] = mapped_column(BigInteger, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
