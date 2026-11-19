"""Напоминание, что ежедневный бонус снова доступен (раз в игровой день)."""
from __future__ import annotations

import asyncio
import datetime as dt

from aiogram import Bot
from sqlalchemy import select

from app.config.logging import get_logger
from app.database.session import get_session
from app.models.user import User
from app.repositories.user import UserSettingRepository
from app.services.notifications import FOOTER, notif_enabled
from app.utils.dates import current_game_day

logger = get_logger(__name__)
INTERVAL = 300.0
REMIND_HOUR_UTC = 12
MAX_BALANCE = 100_000


async def _tick(bot: Bot) -> None:
    now = dt.datetime.now(dt.timezone.utc)
    if now.hour != REMIND_HOUR_UTC:
        return
    today = current_game_day(now)
    async with get_session() as session:
        ids = (await session.execute(
            select(User.id).where(
                User.is_banned.is_(False),
                User.balance <= MAX_BALANCE,
                User.last_daily_bonus_date.is_not(None),
                User.last_daily_bonus_date < today,
            )
        )).scalars().all()
        repo = UserSettingRepository(session)
        for uid in ids:
            if await repo.get_value(uid, "bonus_reminded") == today.isoformat():
                continue
            await repo.set_value(uid, "bonus_reminded", today.isoformat())
            await session.commit()
            if not await notif_enabled(session, uid, "bonus"):
                continue
            try:
                await bot.send_message(uid, "🎁 <b>Бонус снова доступен!</b>\nЗабери: 👤 Профиль → 🎁" + FOOTER, parse_mode="HTML")
            except Exception:
                pass
            await asyncio.sleep(0.05)


async def run_bonus_reminder_loop(bot: Bot) -> None:
    logger.info("bonus_reminder_loop.started")
    while True:
        try:
            await _tick(bot)
        except Exception:
            logger.exception("bonus_reminder_failed")
        await asyncio.sleep(INTERVAL)
