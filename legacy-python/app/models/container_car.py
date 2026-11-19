"""Какие машины могут выпасть из контейнера и с каким относительным весом
(шансы редкости берутся из Setting['rarity_chances'], а конкретная машина
внутри выпавшей редкости — пропорционально drop_weight среди подходящих)."""
from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin


class ContainerCar(Base, TimestampMixin):
    __tablename__ = "container_cars"
    __table_args__ = (
        UniqueConstraint("container_id", "car_id", name="uq_container_cars_container_car"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    container_id: Mapped[int] = mapped_column(
        ForeignKey("containers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    car_id: Mapped[int] = mapped_column(
        ForeignKey("cars.id", ondelete="CASCADE"), nullable=False, index=True
    )
    drop_weight: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
