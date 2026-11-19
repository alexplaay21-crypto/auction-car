"""Гибкие пользовательские настройки, не вошедшие в основную таблицу users
(ключ-значение, чтобы не плодить миграции под каждую мелкую опцию)."""
from __future__ import annotations

from sqlalchemy import BigInteger, ForeignKey, JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin


class UserSetting(Base, TimestampMixin):
    __tablename__ = "user_settings"
    __table_args__ = (UniqueConstraint("user_id", "key", name="uq_user_settings_user_key"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    key: Mapped[str] = mapped_column(String(100), nullable=False)
    value: Mapped[dict | list | str | int | float | bool | None] = mapped_column(JSON, nullable=True)
