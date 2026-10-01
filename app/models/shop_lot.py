from __future__ import annotations

import datetime as dt

from sqlalchemy import BigInteger, Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin


class ShopLot(Base, TimestampMixin):
    __tablename__ = "shop_lots"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    photo_file_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    price: Mapped[int] = mapped_column(BigInteger, nullable=False)

    is_available: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    available_from: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    available_until: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
