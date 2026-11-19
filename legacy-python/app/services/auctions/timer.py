"""Поиск аукционов, чей таймер истёк и которые нужно завершить.

Источник истины — ends_at в PostgreSQL (не Redis TTL и не in-memory
таймер), поэтому это работает одинаково что при обычной работе, что сразу
после рестарта процесса (раздел 28 ТЗ)."""
from __future__ import annotations

import datetime as dt

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auction import Auction
from app.repositories.auction import AuctionRepository


async def due_auctions(session: AsyncSession, now: dt.datetime | None = None) -> list[Auction]:
    """Активные аукционы, чей ends_at уже наступил."""
    now = now or dt.datetime.now(dt.timezone.utc)
    active = await AuctionRepository(session).list_active()
    return [a for a in active if a.ends_at <= now]
