"""Контейнеры в инвентаре игрока (награды магазина/BP/промокодов/админа).
Один ряд на пару (игрок, контейнер) с количеством; открытие даёт случайную
машину из этого контейнера без аукциона."""
from __future__ import annotations

from sqlalchemy import BigInteger, CheckConstraint, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin


class UserContainer(Base, TimestampMixin):
    __tablename__ = "user_containers"
    __table_args__ = (
        UniqueConstraint("user_id", "container_id", name="uq_user_containers_user_container"),
        CheckConstraint("quantity >= 0", name="ck_user_containers_quantity_non_negative"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    container_id: Mapped[int] = mapped_column(
        ForeignKey("containers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
