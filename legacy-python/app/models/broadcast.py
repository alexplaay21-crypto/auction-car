from __future__ import annotations

import datetime as dt

from sqlalchemy import BigInteger, DateTime, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import (
    BroadcastAudience,
    BroadcastContentType,
    BroadcastSchedule,
    BroadcastStatus,
)
from app.database.base import Base, TimestampMixin


class Broadcast(Base, TimestampMixin):
    __tablename__ = "broadcasts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    created_by: Mapped[int] = mapped_column(BigInteger, nullable=False)

    content_type: Mapped[BroadcastContentType] = mapped_column(nullable=False)
    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    media_file_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    buttons: Mapped[list | None] = mapped_column(JSON, nullable=True)  # inline-кнопки

    audience: Mapped[BroadcastAudience] = mapped_column(nullable=False)
    audience_filter: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # для CUSTOM

    schedule_type: Mapped[BroadcastSchedule] = mapped_column(default=BroadcastSchedule.ONCE, nullable=False)
    scheduled_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    status: Mapped[BroadcastStatus] = mapped_column(default=BroadcastStatus.DRAFT, nullable=False)
