"""Цикл ежедневного бэкапа: раз в минуту проверяет, не пора ли."""
from __future__ import annotations

import asyncio

from aiogram import Bot

from app.config.logging import get_logger
from app.services.backups.service import backup_tick

logger = get_logger(__name__)

POLL_INTERVAL_SECONDS = 60.0


async def run_backup_loop(bot: Bot) -> None:
    while True:
        try:
            await backup_tick(bot)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("backup.tick_failed")
        await asyncio.sleep(POLL_INTERVAL_SECONDS)
