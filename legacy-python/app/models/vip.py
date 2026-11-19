"""VIP постоянный (User.is_vip). Здесь — история получения VIP (покупка/
выдача админом/промо/BP), нужна для статистики и карточки игрока в админке.
Цена/бонусы/комиссии VIP хранятся в Setting (ключ 'vip_config')."""
from __future__ import annotations

from sqlalchemy import BigInteger, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import VipSource
from app.database.base import Base, TimestampMixin


class VipGrant(Base, TimestampMixin):
    __tablename__ = "vip_grants"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source: Mapped[VipSource] = mapped_column(nullable=False)
    price_paid: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    granted_by: Mapped[int | None] = mapped_column(BigInteger, nullable=True)  # admin user_id
