from __future__ import annotations

from sqlalchemy import BigInteger, Boolean, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin


class Container(Base, TimestampMixin):
    __tablename__ = "containers"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    photo_file_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    price: Mapped[int] = mapped_column(BigInteger, nullable=False)  # первоначальная ставка

    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
