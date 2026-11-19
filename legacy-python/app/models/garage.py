"""Гараж игрока: сама вместимость (Garage) и владение экземплярами машин
(UserCar) — один Car-шаблон может быть у игрока в нескольких экземплярах."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import ObtainedFrom
from app.database.base import Base, TimestampMixin


class Garage(Base, TimestampMixin):
    __tablename__ = "garages"

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    capacity: Mapped[int] = mapped_column(default=15, nullable=False)


class UserCar(Base, TimestampMixin):
    """Конкретный экземпляр машины, принадлежащий игроку (или проданный/переданный)."""
    __tablename__ = "user_cars"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    car_id: Mapped[int] = mapped_column(
        ForeignKey("cars.id", ondelete="RESTRICT"), nullable=False, index=True
    )

    obtained_from: Mapped[ObtainedFrom] = mapped_column(nullable=False)
    obtained_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    is_sold: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sold_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sold_price: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    # Кнопка "Продать" после получения машины пропадает через N минут (Setting).
    sell_prompt_expires_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
