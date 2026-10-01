"""Бота удалили из группы или заблокировали в ней — это не должно ломать
работу (раздел 1 ТЗ). Группа помечается неактивной, а её комнаты получают
/stop: текущие контейнеры доигрываются, новые не запускаются, фоновая
задача не пытается писать в недоступный чат бесконечно.

Обработчик работает без ctx/сессии из middleware (событие my_chat_member —
не message/callback_query), поэтому открывает свою короткую сессию."""
from __future__ import annotations

from aiogram import Router
from aiogram.types import ChatMemberUpdated

from app.config.logging import get_logger
from app.core.enums import RoomScope
from app.database.session import get_session
from app.repositories.group import GroupRepository
from app.repositories.room import RoomRepository

router = Router(name="settings_group")
logger = get_logger(__name__)


@router.my_chat_member()
async def on_bot_membership_changed(event: ChatMemberUpdated) -> None:
    if event.chat.type not in ("group", "supergroup"):
        return
    if event.new_chat_member.status not in ("left", "kicked"):
        return

    try:
        async with get_session() as session:
            await GroupRepository(session).deactivate(event.chat.id)
            await RoomRepository(session).request_stop_for_scope(RoomScope.GROUP, event.chat.id)
            await session.commit()
        logger.info("group.bot_removed", chat_id=event.chat.id)
    except Exception:
        logger.exception("group.bot_removed_handler_failed", chat_id=event.chat.id)
