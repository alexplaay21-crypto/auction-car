"""
Базовый класс моделей SQLAlchemy и общие миксины.

Все модели (app/models/*) наследуются от Base. TimestampMixin добавляет
created_at/updated_at, которые нужны почти везде (история, аудит,
восстановление состояния после рестарта).
"""
from __future__ import annotations

import datetime as dt

from sqlalchemy import BigInteger, DateTime, Enum as SAEnum, func
from app.core.enums import (
    Language,
    Rarity,
    RoomScope,
    RoomStatus,
    AuctionStatus,
    ObtainedFrom,
    SaleStatus,
    TransactionType,
    VipSource,
    RewardType,
    BroadcastContentType,
    BroadcastAudience,
    BroadcastSchedule,
    BroadcastStatus,
    DeliveryStatus,
    OperationStatus,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Общий предок для всех ORM-моделей проекта."""

    type_annotation_map = {
        Language: SAEnum(Language, name="language", values_callable=lambda x: [e.value for e in x]),
        Rarity: SAEnum(Rarity, name="rarity", values_callable=lambda x: [e.value for e in x]),
        RoomScope: SAEnum(RoomScope, name="room_scope", values_callable=lambda x: [e.value for e in x]),
        RoomStatus: SAEnum(RoomStatus, name="room_status", values_callable=lambda x: [e.value for e in x]),
        AuctionStatus: SAEnum(AuctionStatus, name="auction_status", values_callable=lambda x: [e.value for e in x]),
        ObtainedFrom: SAEnum(ObtainedFrom, name="obtained_from", values_callable=lambda x: [e.value for e in x]),
        SaleStatus: SAEnum(SaleStatus, name="sale_status", values_callable=lambda x: [e.value for e in x]),
        TransactionType: SAEnum(TransactionType, name="transaction_type", values_callable=lambda x: [e.value for e in x]),
        VipSource: SAEnum(VipSource, name="vip_source", values_callable=lambda x: [e.value for e in x]),
        RewardType: SAEnum(RewardType, name="reward_type", values_callable=lambda x: [e.value for e in x]),
        BroadcastContentType: SAEnum(BroadcastContentType, name="broadcast_content_type", values_callable=lambda x: [e.value for e in x]),
        BroadcastAudience: SAEnum(BroadcastAudience, name="broadcast_audience", values_callable=lambda x: [e.value for e in x]),
        BroadcastSchedule: SAEnum(BroadcastSchedule, name="broadcast_schedule", values_callable=lambda x: [e.value for e in x]),
        BroadcastStatus: SAEnum(BroadcastStatus, name="broadcast_status", values_callable=lambda x: [e.value for e in x]),
        DeliveryStatus: SAEnum(DeliveryStatus, name="delivery_status", values_callable=lambda x: [e.value for e in x]),
        OperationStatus: SAEnum(OperationStatus, name="operation_status", values_callable=lambda x: [e.value for e in x]),
    }


class TimestampMixin:
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class BigIntPK:
    """Первичный ключ BigInteger — для таблиц, где ожидается большой объём строк
    (ставки, история, операции) и где id иногда совпадает с Telegram ID."""
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
