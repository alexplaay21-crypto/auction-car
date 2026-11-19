"""
Асинхронное подключение к PostgreSQL.

Единственный источник истины для активного игрового состояния (аукционы,
балансы, гараж и т.д.) — эта БД. Redis (app/database/redis.py) используется
только как вспомогательный механизм (локи, кэш, rate limit, FSM), а не как
замена PostgreSQL для важных данных.
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config.settings import settings

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        _engine = create_async_engine(
            settings.postgres_url,
            pool_pre_ping=True,
            pool_size=10,
            max_overflow=20,
            echo=False,
        )
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(
            bind=get_engine(),
            expire_on_commit=False,
            autoflush=False,
        )
    return _session_factory


@asynccontextmanager
async def get_session() -> AsyncIterator[AsyncSession]:
    """Контекстный менеджер для одиночной сессии вне middleware
    (schedulers, tasks, scripts)."""
    session_factory = get_session_factory()
    async with session_factory() as session:
        yield session


async def dispose_engine() -> None:
    """Вызывать при остановке приложения (graceful shutdown)."""
    global _engine
    if _engine is not None:
        await _engine.dispose()
        _engine = None
