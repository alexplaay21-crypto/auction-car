"""🎮 Играть — вход в текущую комнату и запуск аукциона."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.types import Message

from app.core.context import RequestContext
from app.core.enums import RoomScope
from app.keyboards.auction import room_keyboard
from app.keyboards.main_menu import menu_text_variants
from app.localization.manager import t
from app.repositories.container import ContainerRepository
from app.repositories.user import UserRepository
from app.services.auctions.presentation import render_container_card
from app.services.auctions.service import AuctionService
from app.services.rooms.manager import resolve_scope
from app.services.rooms.membership import RoomMembershipService

router = Router(name="auction_room")


@router.message(F.text.in_(menu_text_variants("menu_play")))
async def cmd_play(message: Message, ctx: RequestContext) -> None:
    scope, scope_id = resolve_scope(message.chat.type, message.chat.id)

    membership = RoomMembershipService(ctx.session)
    room = await membership.join_current_room(ctx.user, scope, scope_id)

    if room is None:
        await message.answer(t("room_waiting", ctx.language))
        return

    count, capacity = await membership.room_status(room)
    text = t(
        "room_status",
        ctx.language,
        room_number=room.room_number,
        count=count,
        capacity=capacity,
    )

    if scope is RoomScope.PRIVATE:
        await message.answer(
            text,
            reply_markup=room_keyboard(ctx.language, room.id),
        )
    else:
        await message.answer(text)

    # Запускаем первый аукцион, если в комнате его ещё нет.
    auction_service = AuctionService(ctx.session)
    auction = await auction_service.start_next_container(
        room,
        ctx.language,
    )

    if auction is None:
        return

    container = await ContainerRepository(ctx.session).get(
        auction.container_id
    )

    if container is None:
        return

    leader = (
        await UserRepository(ctx.session).get(
            auction.current_leader_id
        )
        if auction.current_leader_id is not None
        else None
    )

    await message.answer(
        render_container_card(
            auction,
            container,
            leader,
            ctx.language,
        )
    )
