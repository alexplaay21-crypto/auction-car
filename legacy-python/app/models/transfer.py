from __future__ import annotations

from sqlalchemy import BigInteger, ForeignKey, Numeric
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin


class Transfer(Base, TimestampMixin):
    __tablename__ = "transfers"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    from_user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    to_user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    commission_rate: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False)
    commission_amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
