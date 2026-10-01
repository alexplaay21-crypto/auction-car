"""Шаблон машины (каталог). Владение конкретным экземпляром — см. models/garage.py:UserCar."""
from __future__ import annotations

from sqlalchemy import Boolean, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import Rarity
from app.database.base import Base, TimestampMixin


class Car(Base, TimestampMixin):
    __tablename__ = "cars"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    photo_file_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)

    rarity: Mapped[Rarity] = mapped_column(nullable=False)

    max_speed: Mapped[int] = mapped_column(nullable=False)          # км/ч
    accel_0_100: Mapped[float] = mapped_column(Numeric(4, 2), nullable=False)  # сек
    power: Mapped[int] = mapped_column(nullable=False)              # л.с.
    handling: Mapped[int] = mapped_column(nullable=False)           # 0-100 (шкала)
    reliability: Mapped[int] = mapped_column(nullable=False)        # 0-100 (шкала)

    price: Mapped[int] = mapped_column(nullable=False)              # базовая стоимость

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
