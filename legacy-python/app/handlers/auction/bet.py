"""/bet AMOUNT (ставка/с | bet/b) — ставка в текущем аукционе комнаты,
в которую вошёл игрок."""
from __future__ import annotations

from aiogram import Router
from aiogram.types import Message

from app.core.context import RequestContext
from app.core.exceptions import AppError
from app.filters.command_alias import CommandAlias
from app.localization.manager import t
from app.repositories.container import ContainerRepository
from app.repositories.user import UserRepository
from app.services.auctions.bidding import BiddingService
from app.services.auctions.presentation import render_container_card
from app.services.rooms.manager import resolve_scope
from app.repositories.room import RoomRepository

router = Router(name="auction_bet")

ALIASES = ("bet", "b", "ставка", "с")


@router.message(CommandAlias(*ALIASES))
async def cmd_bet(message: Message, ctx: RequestContext, command_args: str) -> None:
    raw = command_args.strip()
    if not raw.isdigit():
        raise AppError(t("bet_too_low", ctx.language, min_amount=0))

    scope, scope_id = resolve_scope(message.chat.type, message.chat.id)
    room = await RoomRepository(ctx.session).find_active_room_for_user(ctx.user.id, scope, scope_id)
    if room is None:
        raise AppError(t("error_not_found", ctx.language))

    auction = await BiddingService(ctx.session).place_bid(ctx.user, room.id, int(raw))

    container = await ContainerRepository(ctx.session).get(auction.container_id)
    leader = await UserRepository(ctx.session).get(auction.current_leader_id)
    await message.answer(render_container_card(auction, container, leader, ctx.language))
