"""Единый ключ distributed-лока на аукцион конкретной комнаты — используется
и ставками (bidding.py), и оркестрацией раунда (service.py), чтобы никогда
не разойтись в форматe ключа между ними."""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from app.database.transaction import distributed_lock


@asynccontextmanager
async def auction_lock(room_id: int) -> AsyncIterator[None]:
    async with distributed_lock(f"auction_room:{room_id}"):
        yield
