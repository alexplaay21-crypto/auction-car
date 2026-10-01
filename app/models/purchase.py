"""Каждая покупка в магазине получает уникальный ID (первичный ключ)."""
from __future__ import annotations

from sqlalchemy import BigInteger, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin


class Purchase(Base, TimestampMixin):
    __tablename__ = "purchases"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    lot_id: Mapped[int] = mapped_column(
        ForeignKey("shop_lots.id", ondelete="RESTRICT"), nullable=False
    )
    price_paid: Mapped[int] = mapped_column(BigInteger, nullable=False)
