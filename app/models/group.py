from __future__ import annotations

from sqlalchemy import BigInteger, Boolean, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import Language
from app.database.base import Base, TimestampMixin


class Group(Base, TimestampMixin):
    """Telegram-группа/чат, добавленная админом. id = chat id (отрицательный)."""
    __tablename__ = "groups"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=False)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    language: Mapped[Language] = mapped_column(default=Language.RU, nullable=False)
    auction_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    added_by: Mapped[int] = mapped_column(BigInteger, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    invite_link: Mapped[str | None] = mapped_column(String(255), nullable=True)
