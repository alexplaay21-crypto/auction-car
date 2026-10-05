"""/chance (шансы, шанс | chance, ch) — показывает текущие шансы редкости
(раздел 10 ТЗ), используя тот же Setting['rarity_chances'], что и
services/containers/randomizer.py.

/container (конты, конт | container, cont) — показывает/запускает текущий
контейнер в комнате, в которую игрок уже вошёл (или входит автоматически,
как по кнопке 'Играть')."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.types import Message

from app.core.context import RequestContext
from app.core.enums import Rarity
from app.filters.command_alias import CommandAlias
from app.localization.manager import t
from app.repositories.container import ContainerRepository
from app.repositories.room import RoomRepository
from app.repositories.user import UserRepository
from app.services.auctions.presentation import render_container_card
from app.services.auctions.service import AuctionService
from app.services.containers.randomizer import ContainerRandomizer
from app.services.rooms.manager import resolve_scope
from app.services.rooms.membership import RoomMembershipService

router = Router(name="auction_container")

CONTAINER_ALIASES = ("container", "cont", "конты", "конт")

_RARITY_ORDER = (Rarity.COMMON, Rarity.RARE, Rarity.EPIC, Rarity.MYTHIC)
_RARITY_LABEL_KEYS = {
    Rarity.COMMON: "rarity_common",
    Rarity.RARE: "rarity_rare",
    Rarity.EPIC: "rarity_epic",
    Rarity.MYTHIC: "rarity_mythic",
}






@router.message(CommandAlias(*CONTAINER_ALIASES))
async def cmd_container(message: Message, ctx: RequestContext, command_args: str) -> None:
    scope, scope_id = resolve_scope(message.chat.type, message.chat.id)

    room_repo = RoomRepository(ctx.session)
    room = await room_repo.find_active_room_for_user(ctx.user.id, scope, scope_id)
    if room is None:
        # Ещё не входил в комнату — входим автоматически, как по кнопке 'Играть'.
        room = await RoomMembershipService(ctx.session).join_current_room(
            ctx.user,
            scope,
            scope_id,
        )

        if room is None:
            await message.answer(t("room_waiting", ctx.language))
            return

    auction_service = AuctionService(ctx.session)
    auction = await auction_service.start_next_container(room, ctx.language)
    if auction is None:
        return  # комната закрыта/пуста — start_next_container уже это обработал

    container = await ContainerRepository(ctx.session).get(auction.container_id)
    leader = (
        await UserRepository(ctx.session).get(auction.current_leader_id)
        if auction.current_leader_id is not None
        else None
    )
    await message.answer(render_container_card(auction, container, leader, ctx.language))
