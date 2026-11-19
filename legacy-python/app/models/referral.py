"""Один инвайт = одна запись, уникальна по invited_id (приглашённого
нельзя засчитать повторно, даже если его пригласили заново)."""
from __future__ import annotations

from sqlalchemy import BigInteger, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin


class Referral(Base, TimestampMixin):
    __tablename__ = "referrals"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    inviter_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    invited_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True
    )

    inviter_bonus_paid: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    invited_bonus_paid: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    first_purchase_bonus_paid: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
