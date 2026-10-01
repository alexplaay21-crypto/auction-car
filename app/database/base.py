"""
Базовый класс моделей SQLAlchemy и общие миксины.

Все модели (app/models/*) наследуются от Base. TimestampMixin добавляет
created_at/updated_at, которые нужны почти везде (история, аудит,
восстановление состояния после рестарта).
"""
from __future__ import annotations

import datetime as dt

from sqlalchemy import BigInteger, DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Общий предок для всех ORM-моделей проекта."""
    pass


class TimestampMixin:
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class BigIntPK:
    """Первичный ключ BigInteger — для таблиц, где ожидается большой объём строк
    (ставки, история, операции) и где id иногда совпадает с Telegram ID."""
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
