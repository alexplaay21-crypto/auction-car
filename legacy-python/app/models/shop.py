"""Общие настройки магазина (пока — только включён/выключен целиком;
лоты см. shop_lot.py). Singleton-строка с id=1."""
from __future__ import annotations

from sqlalchemy import Boolean
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin


class ShopSettings(Base, TimestampMixin):
    __tablename__ = "shop_settings"

    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
