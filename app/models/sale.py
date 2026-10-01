"""Предложение продажи машины другому игроку (/sell). Продажа государству
(/sellcar) отдельной сущности не требует — фиксируется как Transaction."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import BigInteger, DateTime, ForeignKey, Numeric
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import SaleStatus
from app.database.base import Base, TimestampMixin


class Sale(Base, TimestampMixin):
    __tablename__ = "sales"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    seller_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    buyer_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_car_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("user_cars.id", ondelete="CASCADE"), nullable=False
    )

    price: Mapped[int] = mapped_column(BigInteger, nullable=False)
    commission_rate: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False)

    status: Mapped[SaleStatus] = mapped_column(default=SaleStatus.PENDING, nullable=False)
    resolved_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
