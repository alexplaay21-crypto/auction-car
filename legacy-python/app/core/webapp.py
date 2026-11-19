"""HTTP-приложение (aiogram + aiohttp): приём webhook, /health, жизненный
цикл фоновых задач. TLS терминирует обратный прокси (Caddy/nginx) — сам
процесс слушает обычный HTTP на WEBAPP_HOST:WEBAPP_PORT."""
from __future__ import annotations

import asyncio

from aiogram import Bot, Dispatcher
from aiogram.webhook.aiohttp_server import SimpleRequestHandler, setup_application
from aiohttp import web
from sqlalchemy import text

from app.config.logging import get_logger
from app.config.settings import settings
from app.database.redis import get_redis
from app.database.session import get_engine

logger = get_logger(__name__)

HEALTH_TIMEOUT_SECONDS = 3.0
SCHEDULER_KEY = web.AppKey("scheduler_tasks", list)


async def _check_db() -> bool:
    try:
        async with get_engine().connect() as conn:
            await asyncio.wait_for(conn.execute(text("SELECT 1")), HEALTH_TIMEOUT_SECONDS)
        return True
    except Exception:
        return False


async def _check_redis() -> bool:
    try:
        return bool(await asyncio.wait_for(get_redis().ping(), HEALTH_TIMEOUT_SECONDS))
    except Exception:
        return False


async def health(_: web.Request) -> web.Response:
    db_ok, redis_ok = await asyncio.gather(_check_db(), _check_redis())
    ok = db_ok and redis_ok
    return web.json_response(
        {"status": "ok" if ok else "degraded", "db": db_ok, "redis": redis_ok},
        status=200 if ok else 503,
    )


async def start_background(bot: Bot) -> list[asyncio.Task]:
    """Восстановление после рестарта (раздел 28 ТЗ) + фоновые циклы."""
    from app.schedulers.scheduler import setup_schedulers
    from app.tasks.auction_tasks import run_auction_tick

    try:
        await run_auction_tick(bot)  # завершить всё, что истекло, пока бот был недоступен
    except Exception:
        logger.exception("startup.recovery_failed")
    return setup_schedulers(bot)


def build_web_app(bot: Bot, dp: Dispatcher) -> web.Application:
    app = web.Application()
    app.router.add_get("/health", health)

    SimpleRequestHandler(
        dispatcher=dp, bot=bot, secret_token=settings.webhook_secret_token
    ).register(app, path=settings.webhook_path)
    setup_application(app, dp, bot=bot)

    async def on_startup(app: web.Application) -> None:
        await bot.set_webhook(
            url=settings.webhook_url,
            secret_token=settings.webhook_secret_token,
            allowed_updates=dp.resolve_used_update_types(),
            drop_pending_updates=False,  # накопленные за время простоя апдейты не теряем
        )
        logger.info("webhook.set", url=settings.webhook_url)
        app[SCHEDULER_KEY] = await start_background(bot)

    async def on_cleanup(app: web.Application) -> None:
        from app.schedulers.scheduler import shutdown_schedulers

        await shutdown_schedulers(app.get(SCHEDULER_KEY, []))
        # Вебхук при остановке НЕ удаляем: при рестарте Telegram держит
        # апдейты в очереди и отдаст их после старта.

    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)
    return app
