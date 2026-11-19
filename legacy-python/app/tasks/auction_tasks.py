"""Фоновая задача аукциона: периодически ищет истёкшие по времени
аукционы (services/auctions/timer.py), завершает их
(services/auctions/service.py) и рассылает результат в чат — это
единственное место, где логика аукциона встречается с Telegram Bot,
поэтому вся отправка сообщений живёт здесь, а не в services/."""
from __future__ import annotations

import asyncio

from aiogram import Bot
from aiogram.exceptions import TelegramForbiddenError, TelegramNotFound

from app.config.logging import get_logger
from app.core.enums import Language, RoomScope
from app.core.constants import MAX_PLAYERS_PER_ROOM
from app.database.session import get_session
from app.database.transaction import atomic, distributed_lock
from app.localization.manager import t
from app.repositories.auction import AuctionRepository
from app.repositories.container import ContainerRepository
from app.repositories.room import RoomMemberRepository, RoomRepository
from app.repositories.room_waiter import RoomWaiterRepository
from app.repositories.user import UserRepository
from app.services.auctions.presentation import render_container_card
from app.services.auctions.service import AuctionService, FinalizeResult
from app.services.auctions.timer import due_auctions
from app.services.cars.service import CarService
from app.utils.usernames import format_mention

logger = get_logger(__name__)

DEFAULT_POLL_INTERVAL_SECONDS = 2.0


async def _recipients(session, room) -> list[tuple[int, Language]]:
    """Кому отправлять сообщение о комнате: одно сообщение в группу, или
    персонально каждому активному участнику в ЛС (у каждого свой язык)."""
    if room.scope is RoomScope.GROUP:
        from app.repositories.group import GroupRepository

        group = await GroupRepository(session).get(room.scope_id)
        language = group.language if group is not None else Language.RU
        return [(room.scope_id, language)]

    members = await RoomMemberRepository(session).list_active_members(room.id)
    user_repo = UserRepository(session)
    recipients = []
    for member in members:
        user = await user_repo.get(member.user_id)
        if user is not None:
            recipients.append((user.id, user.language))
    return recipients


async def _deactivate_group(session, group_id: int) -> None:
    """Бота выгнали/заблокировали в группе (раздел 1 ТЗ): группа выключается,
    комнате ставится /stop — больше туда не пишем, остальные комнаты живут."""
    from app.repositories.group import GroupRepository
    from app.repositories.room import RoomRepository

    try:
        await GroupRepository(session).deactivate(group_id)
        await RoomRepository(session).request_stop_for_scope(RoomScope.GROUP, group_id)
        await session.commit()
    except Exception:
        logger.exception("group_deactivate_failed", group_id=group_id)
        await session.rollback()


async def _send_to_room(bot: Bot, session, room, text_by_language) -> None:
    for chat_id, language in await _recipients(session, room):
        try:
            await bot.send_message(chat_id, text_by_language(language))
        except (TelegramForbiddenError, TelegramNotFound) as exc:
            logger.warning("auction_chat_unavailable", chat_id=chat_id, error=type(exc).__name__)
            if room.scope is RoomScope.GROUP:
                await _deactivate_group(session, room.scope_id)
        except Exception:
            logger.exception("auction_notify_failed", chat_id=chat_id)


_bg_tasks: set[asyncio.Task] = set()


async def _announce_result(bot: Bot, session, result: FinalizeResult) -> None:
    container = await ContainerRepository(session).get(result.auction.container_id)

    if result.winner_user_id is None:
        await _send_to_room(bot, session, result.room, lambda lang: t("container_no_bids_closed", lang))
    else:
        winner = await UserRepository(session).get(result.winner_user_id)
        mention = format_mention(winner) if winner is not None else str(result.winner_user_id)

        await _send_to_room(
            bot, session, result.room,
            lambda lang: f"{mention}\n" + t("auction_won", lang, amount=result.bid_amount),
        )

        # Карточка машины — лично победителю.
        if result.car is not None and winner is not None:
            card = CarService.format_card(result.car, winner.language)
            try:
                if result.auto_sold_amount is not None:
                    card += "\n\n" + t(
                        "garage_full_auto_sold", winner.language, amount=result.auto_sold_amount
                    )
                    await bot.send_message(winner.id, card)
                else:
                    from aiogram.utils.keyboard import InlineKeyboardBuilder

                    from app.callbacks.garage import GarageSellCallback

                    builder = InlineKeyboardBuilder()
                    builder.button(
                        text=t("sell_btn", winner.language),
                        callback_data=GarageSellCallback(user_car_id=result.user_car_id),
                    )
                    await bot.send_message(winner.id, card, reply_markup=builder.as_markup())
                if result.garage_low:
                    from app.services.garage.service import GARAGE_LOW_TEXT
                    await bot.send_message(winner.id, GARAGE_LOW_TEXT)
            except Exception:
                logger.exception("auction_car_card_failed", user_id=winner.id)

    for kicked_id in result.kicked_user_ids:
        user = await UserRepository(session).get(kicked_id)
        if user is not None:
            try:
                await bot.send_message(kicked_id, t("kicked_inactivity", user.language))
            except Exception:
                logger.exception("auction_kick_notify_failed", user_id=kicked_id)

    if result.room_closed:
        return



async def _admit_waiting_players(bot: Bot, room) -> None:
    """После завершения аукциона переводит ожидающих игроков в комнату."""
    async with get_session() as session:
        async with distributed_lock(
            f"room_join:{room.scope.value}:{room.scope_id}"
        ):
            async with atomic(session):
                room_repo = RoomRepository(session)
                member_repo = RoomMemberRepository(session)
                waiter_repo = RoomWaiterRepository(session)
                user_repo = UserRepository(session)

                current_room = await room_repo.get_open_room(
                    room.scope,
                    room.scope_id,
                )

                if current_room is None:
                    current_room = await room_repo.create_room(
                        room.scope,
                        room.scope_id,
                        MAX_PLAYERS_PER_ROOM,
                    )

                waiters = await waiter_repo.list_for_scope(
                    room.scope.value,
                    room.scope_id,
                )

                for waiter in waiters:
                    count = await member_repo.count_members(current_room.id)

                    if count >= current_room.max_players:
                        await room_repo.mark_full(current_room.id)

                        current_room = await room_repo.create_room(
                            room.scope,
                            room.scope_id,
                            MAX_PLAYERS_PER_ROOM,
                        )

                        count = 0

                    existing = await member_repo.get_member(
                        current_room.id,
                        waiter.user_id,
                    )

                    if existing is None:
                        await member_repo.add_member(
                            current_room.id,
                            waiter.user_id,
                        )
                    elif existing.left_at is not None:
                        await member_repo.rejoin(
                            current_room.id,
                            waiter.user_id,
                        )

                    await waiter_repo.remove(waiter.id)

                    new_count = count + 1

                    if new_count >= current_room.max_players:
                        await room_repo.mark_full(current_room.id)

                    user = await user_repo.get(waiter.user_id)

                    if user is not None:
                        try:
                            await bot.send_message(
                                user.id,
                                t(
                                    "room_status",
                                    user.language,
                                    room_number=current_room.room_number,
                                    count=new_count,
                                    capacity=current_room.max_players,
                                ),
                            )
                        except Exception:
                            logger.exception(
                                "waiting_player_notify_failed",
                                user_id=user.id,
                            )


async def _start_next_container_after_delay(bot: Bot, room_id: int) -> None:
    """Запускает следующий контейнер после паузы между раундами."""
    try:
        async with get_session() as session:
            service = AuctionService(session)
            delay = await service._next_container_delay()

        await asyncio.sleep(delay)

        # Сначала даём ожидающим игрокам войти в доступную комнату.
        async with get_session() as session:
            room = await RoomRepository(session).get(room_id)
            if room is None:
                return

        await _admit_waiting_players(bot, room)

        # Продолжаем именно ту комнату, в которой закончился аукцион.
        async with get_session() as session:
            room = await RoomRepository(session).get(room_id)
            if room is None:
                return

            service = AuctionService(session)
            auction = await service.start_next_container(room, Language.RU)
            if auction is None:
                return

            container = await ContainerRepository(session).get(auction.container_id)
            if container is None:
                return

            members = await RoomMemberRepository(session).list_active_members(room.id)
            if not members:
                return

            await _send_to_room(
                bot,
                session,
                room,
                lambda lang: render_container_card(auction, container, None, lang),
            )
    except Exception:
        logger.exception("next_container_start_failed", room_id=room_id)


async def run_auction_tick(bot: Bot) -> None:
    """Один проход: найти и завершить все истёкшие аукционы. Каждый аукцион
    обрабатывается в своей сессии, чтобы atomic() открывал настоящую
    транзакцию (а не savepoint) и результат реально коммитился."""
    async with get_session() as session:
        overdue_ids = [a.id for a in await due_auctions(session)]

    for auction_id in overdue_ids:
        try:
            async with get_session() as session:
                auction = await AuctionRepository(session).get(auction_id)
                if auction is None:
                    continue
                result = await AuctionService(session).finalize_auction(auction)
                await session.commit()

            async with get_session() as session:
                await _announce_result(bot, session, result)

            if not result.room_closed:
                task = asyncio.create_task(
                    _start_next_container_after_delay(bot, result.room.id)
                )
                _bg_tasks.add(task)
                task.add_done_callback(_bg_tasks.discard)
        except Exception:
            logger.exception("auction_finalize_failed", auction_id=auction_id)


async def run_auction_timer_loop(bot: Bot, poll_interval: float = DEFAULT_POLL_INTERVAL_SECONDS) -> None:
    """Бесконечный цикл — реально исполняется, когда приложение входит в
    свой run loop (polling/webhook, этап Webhook). До этого этапа функция
    уже полностью рабочая, просто ещё не запущена в проде."""
    logger.info("auction_timer_loop.started", poll_interval=poll_interval)
    while True:
        try:
            await run_auction_tick(bot)
        except Exception:
            logger.exception("auction_timer_tick_failed")
        await asyncio.sleep(poll_interval)
