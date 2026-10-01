from __future__ import annotations

import datetime as dt

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin


class PromoCode(Base, TimestampMixin):
    __tablename__ = "promo_codes"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)

    rewards: Mapped[list] = mapped_column(JSON, nullable=False)  # [{"type": "money", "amount": 1000}, ...]

    activation_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    activations_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    expires_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_by: Mapped[int] = mapped_column(BigInteger, nullable=False)
