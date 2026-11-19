"""Единое key-value хранилище всех изменяемых игровых параметров:
цены, комиссии, таймеры, шансы редкости, ежедневный бонус, referral-бонусы,
VIP-конфиг и т.д. Это и есть тот самый 'не хардкодить' механизм — сервисы
читают значения отсюда (с кэшем в Redis при необходимости на этапе Redis),
а не из констант в коде.

Примеры ключей (заполняются seed-миграцией на этапе Alembic):
  bet_step_default            -> 500
  auction_timer_seconds        -> 30
  next_container_delay_seconds -> 5
  rarity_chances                -> {"common": 60, "rare": 30, "epic": 9, "mythic": 1}
  daily_bonus_amount            -> 1000
  commission_quick_sell          -> {"regular": 0.10, "vip": 0.05}
  commission_sell_state          -> {"regular": 0.40, "vip": 0.30}
  commission_sell_player         -> {"regular": 0.25, "vip": 0.15}
  commission_transfer            -> {"regular": 0.10, "vip": 0.0}
  vip_config                      -> {"price": 500000, "garage_bonus_slots": 10}
  sell_button_timeout_minutes    -> 15
  kick_after_inactive_containers -> 3
"""
from __future__ import annotations

from sqlalchemy import BigInteger, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin


class Setting(Base, TimestampMixin):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[dict | list | str | int | float | bool] = mapped_column(JSON, nullable=False)
    updated_by: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
