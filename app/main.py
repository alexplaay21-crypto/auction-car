"""
Точка входа приложения.

Production: webhook (aiohttp) + /health + фоновые задачи (таймер аукциона,
рассылки, ежедневный бэкап, автоочистка). DEV (USE_WEBHOOK=false): long
polling — только для локальной разработки.

Порядок старта: конфигурация (мастер первого запуска при необходимости) ->
миграции Alembic -> логирование -> Bot/Dispatcher -> восстановление
активных аукционов -> приём апдейтов.
"""
from __future__ import annotations

import asyncio
import signal
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE_DIR))

from app.config.logging import get_logger, setup_logging  # noqa: E402
from app.config.settings import load_settings  # noqa: E402

logger = get_logger(__name__)


def run_migrations() -> None:
    """alembic upgrade head. Вызывается ДО asyncio.run: env.py Alembic сам
    запускает цикл событий. Обновление версии бота не требует сброса БД."""
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(BASE_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BASE_DIR / "alembic"))
    command.upgrade(cfg, "head")


async def _serve_webhook(bot, dp) -> None:
    from aiohttp import web

    from app.config.settings import settings
    from app.core.webapp import build_web_app

    runner = web.AppRunner(build_web_app(bot, dp))
    await runner.setup()
    site = web.TCPSite(runner, settings.webapp_host, settings.webapp_port)
    await site.start()
    logger.info("webapp.started", host=settings.webapp_host, port=settings.webapp_port)

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop.set)
        except NotImplementedError:  # Windows
            pass
    try:
        await stop.wait()
    finally:
        logger.info("webapp.stopping")
        await runner.cleanup()


async def _serve_polling(bot, dp) -> None:
    from app.core.webapp import start_background
    from app.schedulers.scheduler import shutdown_schedulers

    await bot.delete_webhook(drop_pending_updates=False)
    tasks = await start_background(bot)
    try:
        await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())
    finally:
        await shutdown_schedulers(tasks)


async def _async_main() -> None:
    from app.config.settings import settings
    from app.core.bot import create_bot
    from app.core.dispatcher import create_dispatcher, register_middlewares, register_routers
    from app.database.redis import close_redis
    from app.database.session import dispose_engine

    bot = create_bot()
    dp = create_dispatcher()
    register_middlewares(dp)
    register_routers(dp)
    logger.info("startup.core_ready", mode="webhook" if settings.use_webhook else "polling")

    try:
        if settings.use_webhook:
            await _serve_webhook(bot, dp)
        else:
            await _serve_polling(bot, dp)
    finally:
        await bot.session.close()
        await close_redis()
        await dispose_engine()
        logger.info("shutdown.complete")


def main() -> None:
    settings = load_settings()

    if not settings.is_configured():
        from scripts.setup import run_setup

        run_setup()
        settings = load_settings()

    if settings.run_migrations:
        print("Применяю миграции БД…", flush=True)
        run_migrations()

    setup_logging(settings.log_level)
    logger.info(
        "startup.config_ready", env=settings.env, use_webhook=settings.use_webhook,
        default_language=settings.default_language,
    )
    asyncio.run(_async_main())


if __name__ == "__main__":
    main()
