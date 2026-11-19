"""Идемпотентность критических операций.

Перед выполнением экономической операции (ставка/покупка/продажа/перевод/
выдача награды) сервис создаёт запись Operation с уникальным operation_id
(INSERT ... ON CONFLICT DO NOTHING). Если запись уже существовала со
статусом COMPLETED — операция не выполняется повторно, а возвращается её
прежний результат. Работает вместе с database/transaction.py:atomic()
и distributed_lock()."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import BigInteger, DateTime, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import OperationStatus
from app.database.base import Base, TimestampMixin


class Operation(Base, TimestampMixin):
    __tablename__ = "operations"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # uuid4 hex
    type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    user_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True, index=True)

    status: Mapped[OperationStatus] = mapped_column(default=OperationStatus.PENDING, nullable=False)
    payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    completed_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
