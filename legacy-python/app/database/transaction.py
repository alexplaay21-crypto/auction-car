"""
Инфраструктура для атомарных операций и защиты от конкурентного выполнения.

Здесь только низкоуровневые примитивы (транзакция БД, distributed lock
в Redis). Идемпотентность конкретных экономических операций (ставка,
покупка, продажа, перевод, выдача награды) будет построена поверх этого
на этапе Economy, с использованием таблицы operation (app/models/operation.py,
появится на этапе Models) — уникальный operation_id гарантирует, что одна
и та же операция не выполнится дважды при повторном нажатии/сбое.
"""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from typing import AsyncIterator

from redis.asyncio.lock import Lock
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConcurrencyError
from app.database.redis import get_redis

DEFAULT_LOCK_TIMEOUT_SECONDS = 10
DEFAULT_LOCK_BLOCKING_TIMEOUT_SECONDS = 5


@asynccontextmanager
async def atomic(session: AsyncSession) -> AsyncIterator[AsyncSession]:
    """Оборачивает блок кода в транзакцию БД. При исключении — rollback,
    средства/предметы не списываются частично."""
    if session.in_transaction():
        # Вложенный вызов — используем savepoint, чтобы не сломать внешнюю транзакцию.
        async with session.begin_nested():
            yield session
        return

    async with session.begin():
        yield session


@asynccontextmanager
async def distributed_lock(
    key: str,
    timeout: int = DEFAULT_LOCK_TIMEOUT_SECONDS,
    blocking_timeout: int = DEFAULT_LOCK_BLOCKING_TIMEOUT_SECONDS,
) -> AsyncIterator[None]:
    """Redis-лок для операций, которые нельзя выполнять параллельно для одного
    и того же ресурса (например: 'bid:{room_id}', 'balance:{user_id}',
    'container:{container_id}:open').

    Поднимает ConcurrencyError, если не удалось получить лок за blocking_timeout —
    вызывающий код должен показать игроку понятное сообщение ("Кто-то уже
    делает это, попробуйте ещё раз"), а не падать с трейсбеком.
    """
    redis = get_redis()
    lock: Lock = redis.lock(
        name=f"lock:{key}",
        timeout=timeout,
        blocking_timeout=blocking_timeout,
    )
    acquired = await lock.acquire()
    if not acquired:
        raise ConcurrencyError("Операция уже выполняется, попробуйте ещё раз.")
    try:
        yield
    finally:
        try:
            await lock.release()
        except Exception:
            # Лок мог истечь сам по себе (timeout) — это ок, не роняем операцию.
            pass


def new_operation_id() -> str:
    """Уникальный идентификатор операции для идемпотентности
    (используется вместе с app.models.operation на этапе Economy)."""
    return uuid.uuid4().hex
