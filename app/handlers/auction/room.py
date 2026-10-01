"""🎮 Играть — вход в текущую открытую комнату (своей группы или общую
для ЛС), показ статуса комнаты. Сам розыгрыш контейнеров — этап Auctions."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.types import Message

from app.core.context import RequestContext
from app.core.enums import RoomScope
from app.keyboards.auction import room_keyboard
from app.keyboards.main_menu import menu_text_variants
from app.localization.manager import t
from app.services.rooms.manager import resolve_scope
from app.services.rooms.membership import RoomMembershipService

router = Router(name="auction_room")


@router.message(F.text.in_(menu_text_variants("menu_play")))
async def cmd_play(message: Message, ctx: RequestContext) -> None:
    scope, scope_id = resolve_scope(message.chat.type, message.chat.id)

    membership = RoomMembershipService(ctx.session)
    room = await membership.join_current_room(ctx.user, scope, scope_id)
    count, capacity = await membership.room_status(room)

    text = t("room_status", ctx.language, room_number=room.room_number, count=count, capacity=capacity)

    if scope is RoomScope.PRIVATE:
        await message.answer(text, reply_markup=room_keyboard(ctx.language, room.id))
    else:
        await message.answer(text)
