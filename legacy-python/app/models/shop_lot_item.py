"""Содержимое лота — сколько угодно предметов разных типов на один лот."""
from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import RewardType
from app.database.base import Base, TimestampMixin


class ShopLotItem(Base, TimestampMixin):
    __tablename__ = "shop_lot_items"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    lot_id: Mapped[int] = mapped_column(
        ForeignKey("shop_lots.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_type: Mapped[RewardType] = mapped_column(nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
