"""/stop (стоп/ст | stop/st) — останавливает аукцион ПОСЛЕ текущего
контейнера (раздел 9 ТЗ): не отменяет текущий раунд, новые контейнеры
просто перестают запускаться после его завершения."""
from __future__ import annotations

from aiogram import Router
from aiogram.types import Message

from app.core.context import RequestContext
from app.core.exceptions import AppError
from app.filters.command_alias import CommandAlias
from app.localization.manager import t
from app.repositories.room import RoomRepository
from app.services.rooms.manager import resolve_scope

router = Router(name="auction_stop")

ALIASES = ("stop", "st", "стоп", "ст")


@router.message(CommandAlias(*ALIASES))
async def cmd_stop(message: Message, ctx: RequestContext, command_args: str) -> None:
    scope, scope_id = resolve_scope(message.chat.type, message.chat.id)
    room_repo = RoomRepository(ctx.session)
    room = await room_repo.find_active_room_for_user(ctx.user.id, scope, scope_id)
    if room is None:
        raise AppError(t("error_not_found", ctx.language))

    await room_repo.request_stop(room.id)
    await message.answer(t("stop_scheduled", ctx.language))
