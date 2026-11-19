"""Автоочистка раз в CLEANUP_INTERVAL_HOURS (24 ч). Время последнего запуска
хранится в БД — рестарт не сбрасывает и не дублирует очистку. Сроки хранения
лежат в Setting (дефолты ниже), не в коде."""
from __future__ import annotations

import asyncio
import datetime as dt

from app.config.logging import get_logger
from app.core.constants import CLEANUP_INTERVAL_HOURS
from app.core.exceptions import ConcurrencyError
from app.database.session import get_session
from app.database.transaction import distributed_lock
from app.repositories.cleanup import CleanupRepository
from app.repositories.settings import SettingsRepository

logger = get_logger(__name__)

POLL_INTERVAL_SECONDS = 600.0
DEFAULTS = {
    "cleanup_operations_days": 7,
    "cleanup_broadcast_targets_days": 30,
    "cleanup_errors_days": 30,
    "cleanup_sale_offer_hours": 24,
    "cleanup_left_members_days": 30,
}


async def run_cleanup() -> dict[str, int]:
    now = dt.datetime.now(dt.timezone.utc)
    async with get_session() as session:
        async with session.begin():
            cfg = {**DEFAULTS, **await SettingsRepository(session).get_many(list(DEFAULTS))}
            repo = CleanupRepository(session)
            result = {
                "operations": await repo.delete_old_operations(
                    now - dt.timedelta(days=int(cfg["cleanup_operations_days"]))),
                "broadcast_targets": await repo.delete_old_broadcast_targets(
                    now - dt.timedelta(days=int(cfg["cleanup_broadcast_targets_days"]))),
                "system_errors": await repo.delete_old_system_errors(
                    now - dt.timedelta(days=int(cfg["cleanup_errors_days"]))),
                "sale_offers_expired": await repo.expire_old_sale_offers(
                    now - dt.timedelta(hours=int(cfg["cleanup_sale_offer_hours"])), now),
                "room_members": await repo.delete_old_room_members(
                    now - dt.timedelta(days=int(cfg["cleanup_left_members_days"]))),
            }
            await SettingsRepository(session).set_value("cleanup_last_run", now.isoformat())
    logger.info("cleanup.done", **result)
    return result


async def cleanup_tick() -> None:
    async with get_session() as session:
        last = await SettingsRepository(session).get_value("cleanup_last_run")
    now = dt.datetime.now(dt.timezone.utc)
    if last and now - dt.datetime.fromisoformat(last) < dt.timedelta(hours=CLEANUP_INTERVAL_HOURS):
        return
    try:
        async with distributed_lock("cleanup:daily", timeout=600, blocking_timeout=1):
            async with get_session() as session:
                last = await SettingsRepository(session).get_value("cleanup_last_run")
            if last and now - dt.datetime.fromisoformat(last) < dt.timedelta(hours=CLEANUP_INTERVAL_HOURS):
                return
            await run_cleanup()
    except ConcurrencyError:
        return


async def run_cleanup_loop() -> None:
    while True:
        try:
            await cleanup_tick()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("cleanup.tick_failed")
        await asyncio.sleep(POLL_INTERVAL_SECONDS)
