from __future__ import annotations

import datetime as dt

from sqlalchemy import BigInteger, Boolean, CheckConstraint, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import Language
from app.database.base import Base, TimestampMixin


class User(Base, TimestampMixin):
    """Игрок. id = Telegram user id (не autoincrement)."""
    __tablename__ = "users"
    __table_args__ = (CheckConstraint("balance >= 0", name="ck_users_balance_non_negative"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=False)
    username: Mapped[str | None] = mapped_column(String(64), nullable=True)
    first_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    language: Mapped[Language] = mapped_column(default=Language.RU, nullable=False)

    balance: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)

    is_vip: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    vip_since: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    agreed_to_docs: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    agreed_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    is_banned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    ban_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)

    referred_by: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    last_daily_bonus_date: Mapped[dt.date | None] = mapped_column(nullable=True)
    last_seen_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
