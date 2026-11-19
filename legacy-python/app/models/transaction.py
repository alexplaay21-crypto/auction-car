"""Единый денежный журнал (ledger) — источник истины для баланса и истории.
operation_id (уникален, nullable) даёт идемпотентность: одна и та же
операция (по operation_id) не будет проведена дважды при повторе/сбое."""
from __future__ import annotations

from sqlalchemy import BigInteger, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import TransactionType
from app.database.base import Base, TimestampMixin


class Transaction(Base, TimestampMixin):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    type: Mapped[TransactionType] = mapped_column(nullable=False)
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)  # + начисление, - списание
    balance_after: Mapped[int] = mapped_column(BigInteger, nullable=False)

    operation_id: Mapped[str | None] = mapped_column(
        String(64), unique=True, nullable=True, index=True
    )
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
