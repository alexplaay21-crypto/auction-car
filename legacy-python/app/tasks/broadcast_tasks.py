"""Фоновая задача рассылок: находит рассылки, время которых наступило
(Broadcast.status == SCHEDULED и scheduled_at <= now), формирует список
получателей по аудитории заново (актуальные данные на момент отправки, а
не на момент создания рассылки), рассылает контент с кнопками, обновляет
статус — для разовой SENT, для ежедневной/еженедельной планирует
следующий запуск (schedule_type не меняется, значит цикл продолжается)."""
from __future__ import annotations

import asyncio
import datetime as dt

from aiogram import Bot
from aiogram.types import InlineKeyboardMarkup
from aiogram.utils.keyboard import InlineKeyboardBuilder

from app.config.logging import get_logger
from app.core.enums import BroadcastContentType, BroadcastSchedule, BroadcastStatus
from app.database.session import get_session
from app.repositories.broadcast import BroadcastRepository, BroadcastTargetRepository
from app.repositories.user import UserRepository
from app.services.notifications import FOOTER, filter_news

logger = get_logger(__name__)

DEFAULT_POLL_INTERVAL_SECONDS = 15.0
ACTIVE_WINDOW_DAYS = 7  # "активен" = была активность за последние N дней


def _build_keyboard(buttons: list | None) -> InlineKeyboardMarkup | None:
    """buttons: [[{"text": str, "url": str}], ...] — построчно, по одной
    кнопке в строке (простейший формат, достаточный для рассылок)."""
    if not buttons:
        return None
    builder = InlineKeyboardBuilder()
    for row in buttons:
        for btn in row:
            if btn.get("text") and btn.get("url"):
                builder.button(text=btn["text"], url=btn["url"])
    builder.adjust(1)
    return builder.as_markup()


async def _send_one(bot: Bot, user_id: int, broadcast) -> bool:
    keyboard = _build_keyboard(broadcast.buttons)
    text = (text) + FOOTER
    try:
        if broadcast.content_type is BroadcastContentType.TEXT:
            await bot.send_message(user_id, text, reply_markup=keyboard)
        elif broadcast.content_type is BroadcastContentType.PHOTO:
            await bot.send_photo(user_id, broadcast.media_file_id, caption=text, reply_markup=keyboard)
        elif broadcast.content_type is BroadcastContentType.VIDEO:
            await bot.send_video(user_id, broadcast.media_file_id, caption=text, reply_markup=keyboard)
        elif broadcast.content_type is BroadcastContentType.DOCUMENT:
            await bot.send_document(user_id, broadcast.media_file_id, caption=text, reply_markup=keyboard)
        elif broadcast.content_type is BroadcastContentType.ANIMATION:
            await bot.send_animation(
                user_id, broadcast.media_file_id, caption=text, reply_markup=keyboard
            )
        elif broadcast.content_type is BroadcastContentType.VOICE:
            await bot.send_voice(user_id, broadcast.media_file_id, caption=text, reply_markup=keyboard)
        elif broadcast.content_type is BroadcastContentType.STICKER:
            await bot.send_sticker(user_id, broadcast.media_file_id, reply_markup=keyboard)
        else:
            return False
        return True
    except Exception:
        logger.exception("broadcast_send_failed", user_id=user_id, broadcast_id=broadcast.id)
        return False


async def run_broadcast_tick(bot: Bot) -> None:
    async with get_session() as session:
        now = dt.datetime.now(dt.timezone.utc)
        broadcast_repo = BroadcastRepository(session)
        due = await broadcast_repo.list_due(now)

        for broadcast in due:
            await broadcast_repo.set_status(broadcast.id, BroadcastStatus.SENDING)
            await session.commit()

            user_ids = await UserRepository(session).list_ids_for_broadcast(
                broadcast.audience, active_cutoff=now - dt.timedelta(days=ACTIVE_WINDOW_DAYS)
            )

            user_ids = await filter_news(session, user_ids)
            target_repo = BroadcastTargetRepository(session)
            await target_repo.clear_targets(broadcast.id)
            await target_repo.bulk_add(broadcast.id, user_ids)
            await session.commit()

            sent, failed = 0, 0
            for target in await target_repo.list_pending(broadcast.id):
                ok = await _send_one(bot, target.user_id, broadcast)
                if ok:
                    await target_repo.mark_sent(target.id, dt.datetime.now(dt.timezone.utc))
                    sent += 1
                else:
                    await target_repo.mark_failed(target.id, "send_failed")
                    failed += 1
                await session.commit()

            if broadcast.schedule_type is BroadcastSchedule.ONCE:
                await broadcast_repo.set_status(broadcast.id, BroadcastStatus.SENT)
            else:
                delta = (
                    dt.timedelta(days=1) if broadcast.schedule_type is BroadcastSchedule.DAILY
                    else dt.timedelta(days=7)
                )
                await broadcast_repo.update_fields(
                    broadcast.id, scheduled_at=now + delta, status=BroadcastStatus.SCHEDULED
                )
            await session.commit()

            logger.info("broadcast_sent", broadcast_id=broadcast.id, sent=sent, failed=failed)


async def run_broadcast_timer_loop(bot: Bot, poll_interval: float = DEFAULT_POLL_INTERVAL_SECONDS) -> None:
    """Бесконечный цикл — реально работает начиная с этапа Webhook, когда
    появляется основной run loop (см. tasks/auction_tasks.py — тот же
    паттерн)."""
    logger.info("broadcast_timer_loop.started", poll_interval=poll_interval)
    while True:
        try:
            await run_broadcast_tick(bot)
        except Exception:
            logger.exception("broadcast_timer_tick_failed")
        await asyncio.sleep(poll_interval)
