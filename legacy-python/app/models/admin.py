"""Администраторы бота. Владелец задаётся отдельно через settings.OWNER_ID
и не обязан иметь запись здесь — у него всегда полные права."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin

# Ключи прав, которые могут быть True/False в Admin.permissions (JSON).
ADMIN_PERMISSION_KEYS = (
    "users",
    "economy",
    "cars",
    "containers",
    "garage",
    "skills",
    "shop",
    "battle_pass",
    "vip",
    "promo",
    "groups",
    "broadcasts",
    "statistics",
    "documentation",
    "backups",
    "admins",
)


class Admin(Base, TimestampMixin):
    __tablename__ = "admins"

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    permissions: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    granted_by: Mapped[int] = mapped_column(BigInteger, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    granted_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
