"""Общие фикстуры.

Юнит-тесты (tests/unit) работают без внешних сервисов. Интеграционные
(tests/integration) требуют РЕАЛЬНЫЙ PostgreSQL — SQLite не подходит (BigInteger
PK, JSON, enum, ON CONFLICT). Укажите отдельную пустую БД:

    TEST_POSTGRES_URL=postgresql+asyncpg://user:password@localhost:5432/car_auction_test pytest

ВНИМАНИЕ: схема в этой БД удаляется и создаётся заново перед каждым тестом.
Redis подменяется fakeredis (локи работают как настоящие).
"""
from __future__ import annotations

import datetime as dt
import os

import pytest
import pytest_asyncio

TEST_POSTGRES_URL = os.environ.get("TEST_POSTGRES_URL", "")


def pytest_collection_modifyitems(config, items):
    if TEST_POSTGRES_URL:
        return
    skip = pytest.mark.skip(reason="TEST_POSTGRES_URL не задан")
    for item in items:
        if "db_session" in getattr(item, "fixturenames", ()):
            item.add_marker(skip)


@pytest.fixture(autouse=True)
def fake_redis(monkeypatch):
    """distributed_lock берёт get_redis из app.database.transaction."""
    from fakeredis import FakeAsyncRedis

    redis = FakeAsyncRedis(decode_responses=True)
    monkeypatch.setattr("app.database.transaction.get_redis", lambda: redis)
    return redis


@pytest_asyncio.fixture
async def db_session():
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
    from sqlalchemy.pool import NullPool

    import app.models  # noqa: F401  (регистрирует все модели в Base.metadata)
    from app.database.base import Base

    engine = create_async_engine(TEST_POSTGRES_URL, poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)
    async with factory() as session:
        yield session
    await engine.dispose()


# ----------------------------------------------------------------- фабрики
async def make_user(session, user_id: int, balance: int = 0, vip: bool = False, username: str | None = None):
    from app.models.user import User

    user = User(
        id=user_id, username=username or f"user{user_id}", first_name=f"U{user_id}",
        balance=balance, is_vip=vip, agreed_to_docs=True,
    )
    session.add(user)
    await session.flush()
    return user


async def make_car(session, price: int = 100_000, rarity=None, name: str = "Test Car"):
    from app.core.enums import Rarity
    from app.models.car import Car

    car = Car(
        name=name, country="JP", rarity=rarity or Rarity.COMMON, max_speed=200, accel_0_100=6.5,
        power=300, handling=70, reliability=80, price=price,
    )
    session.add(car)
    await session.flush()
    return car


async def make_container(session, car_ids: list[int], price: int = 10_000):
    from app.models.container import Container
    from app.models.container_car import ContainerCar

    container = Container(name="Test Container", country="JP", price=price)
    session.add(container)
    await session.flush()
    for car_id in car_ids:
        session.add(ContainerCar(container_id=container.id, car_id=car_id, drop_weight=1))
    await session.flush()
    return container


async def set_setting(session, key: str, value):
    from app.repositories.settings import SettingsRepository

    await SettingsRepository(session).set_value(key, value)
    await session.flush()


async def balance_of(session, user_id: int) -> int:
    from sqlalchemy import select

    from app.models.user import User

    return (await session.execute(select(User.balance).where(User.id == user_id))).scalar_one()


async def ledger_sum(session, user_id: int) -> int:
    """Сумма ledger обязана равняться балансу (если стартовый баланс = 0 или
    учтён вызывающим) — главный инвариант экономики."""
    from sqlalchemy import func, select

    from app.models.transaction import Transaction

    return int(
        (await session.execute(select(func.coalesce(func.sum(Transaction.amount), 0)).where(Transaction.user_id == user_id))).scalar()
    )


NOW = dt.datetime.now(dt.timezone.utc)
