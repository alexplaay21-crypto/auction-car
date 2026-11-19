"""Запуск фоновых asyncio-задач приложения: цикл таймера аукциона
(tasks/auction_tasks.py) и цикл рассылок (tasks/broadcast_tasks.py).
Ежедневный бэкап (tasks/backup_tasks.py) и автоочистка раз в 24 ч
(tasks/cleanup_tasks.py) подключены тем же setup_schedulers().

Важно: эти задачи реально непрерывно работают только когда процесс живёт
достаточно долго — то есть начиная с этапа Webhook, где появляется
основной run loop (dp.start_polling(...) или aiohttp-приложение). До этого
функция уже полностью рабочая, просто вызывающий код (main.py) завершает
процесс почти сразу после запуска."""
from __future__ import annotations

import asyncio

from aiogram import Bot

from app.config.logging import get_logger
from app.tasks.auction_tasks import run_auction_timer_loop
from app.tasks.backup_tasks import run_backup_loop
from app.tasks.broadcast_tasks import run_broadcast_timer_loop
from app.tasks.bonus_reminder import run_bonus_reminder_loop
from app.tasks.cleanup_tasks import run_cleanup_loop

logger = get_logger(__name__)


def setup_schedulers(bot: Bot) -> list[asyncio.Task]:
    tasks = [
        asyncio.create_task(run_auction_timer_loop(bot), name="auction_timer_loop"),
        asyncio.create_task(run_broadcast_timer_loop(bot), name="broadcast_timer_loop"),
        asyncio.create_task(run_bonus_reminder_loop(bot), name="bonus_reminder_loop"),
        asyncio.create_task(run_backup_loop(bot), name="backup_loop"),
        asyncio.create_task(run_cleanup_loop(), name="cleanup_loop"),
    ]
    logger.info("schedulers.started", count=len(tasks))
    return tasks


async def shutdown_schedulers(tasks: list[asyncio.Task]) -> None:
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
