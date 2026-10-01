"""Оркестрация раунда аукциона: запуск нового контейнера в комнате и
завершение истёкшего по времени (раздел 8-9 ТЗ).

Розыгрыш машины — через services/containers, зачисление в гараж (с
авто-продажей при переполнении) — через services/garage: логика не
дублируется, а переиспользуется. Здесь никаких обращений к Telegram Bot —
эта логика чистая (только БД), отправкой сообщений занимается
tasks/auction_tasks.py, вызывающий эти методы."""
from __future__ import annotations

import dataclasses
import datetime as dt

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.history import record_event
from app.core.enums import AuctionStatus, Language, ObtainedFrom, RoomStatus
from app.database.transaction import atomic
from app.models.auction import Auction
from app.models.car import Car
from app.models.room import Room
from app.repositories.auction import AuctionBidRepository, AuctionRepository
from app.repositories.room import RoomMemberRepository, RoomRepository
from app.repositories.settings import SettingsRepository
from app.repositories.user import UserRepository, UserStatsRepository
from app.services.auctions.locks import auction_lock
from app.services.containers.service import ContainerService
from app.services.garage.service import GarageService

DEFAULT_AUCTION_TIMER_SECONDS = 30
DEFAULT_NEXT_CONTAINER_DELAY_SECONDS = 5
DEFAULT_KICK_AFTER_INACTIVE_CONTAINERS = 3


@dataclasses.dataclass(slots=True)
class FinalizeResult:
    room: Room
    auction: Auction
    winner_user_id: int | None
    bid_amount: int | None
    car: Car | None                 # None, если ставок не было
    user_car_id: int | None         # None, если авто-продано (см. auto_sold_amount)
    auto_sold_amount: int | None
    kicked_user_ids: list[int]
    next_auction: Auction | None    # новый контейнер, если запущен
    room_closed: bool


class AuctionService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.container_service = ContainerService(session)

    async def _timer_seconds(self) -> int:
        return int(
            await SettingsRepository(self.session).get_value(
                "auction_timer_seconds", DEFAULT_AUCTION_TIMER_SECONDS
            )
        )

    async def _next_container_delay(self) -> int:
        return int(
            await SettingsRepository(self.session).get_value(
                "next_container_delay_seconds", DEFAULT_NEXT_CONTAINER_DELAY_SECONDS
            )
        )

    async def _kick_threshold(self) -> int:
        return int(
            await SettingsRepository(self.session).get_value(
                "kick_after_inactive_containers", DEFAULT_KICK_AFTER_INACTIVE_CONTAINERS
            )
        )

    async def start_next_container(self, room: Room, language: Language) -> Auction | None:
        """Запускает новый контейнер в комнате, если есть активные участники
        и не был запрошен /stop. Идемпотентно: если активный аукцион уже
        есть — просто возвращает его."""
        async with auction_lock(room.id):
            async with atomic(self.session):
                room_repo = RoomRepository(self.session)
                member_repo = RoomMemberRepository(self.session)

                active_members = await member_repo.list_active_members(room.id)
                if not active_members or room.stop_requested:
                    if room.status != RoomStatus.CLOSED:
                        await room_repo.mark_closed(room.id, dt.datetime.now(dt.timezone.utc))
                    return None

                existing = await AuctionRepository(self.session).get_active_for_room(room.id)
                if existing is not None:
                    return existing

                container = await self.container_service.pick_random_enabled_container(language)
                ends_at = dt.datetime.now(dt.timezone.utc) + dt.timedelta(
                    seconds=await self._timer_seconds()
                )
                auction = await AuctionRepository(self.session).create(
                    room_id=room.id, container_id=container.id,
                    initial_bid=container.price, ends_at=ends_at,
                )
        return auction

    async def finalize_auction(self, auction: Auction) -> FinalizeResult:
        """Завершает истёкший по времени аукцион: победитель или его
        отсутствие, кик неактивных игроков, запуск следующего контейнера
        (если не было /stop и в комнате остались активные игроки)."""
        async with auction_lock(auction.room_id):
            async with atomic(self.session):
                auction_repo = AuctionRepository(self.session)
                room_repo = RoomRepository(self.session)
                member_repo = RoomMemberRepository(self.session)

                room = await room_repo.get(auction.room_id)
                now = dt.datetime.now(dt.timezone.utc)

                winner_user_id = auction.current_leader_id
                bid_amount = auction.current_bid if winner_user_id is not None else None
                car: Car | None = None
                user_car_id: int | None = None
                auto_sold_amount: int | None = None

                if winner_user_id is not None:
                    car = await self.container_service.roll_car_for_container(
                        auction.container_id, Language.RU
                    )
                    winner = await UserRepository(self.session).get(winner_user_id)
                    user_car, auto_sold_amount = await GarageService(self.session).add_car_to_garage(
                        winner, car.id, car.price, ObtainedFrom.CONTAINER, now,
                    )
                    user_car_id = user_car.id if user_car is not None else None
                    # Профит от контейнера = ценность выпавшей машины (или сумма
                    # авто-продажи при полном гараже) минус оплаченная ставка.
                    drop_value = auto_sold_amount if auto_sold_amount is not None else car.price
                    await UserStatsRepository(self.session).increment(
                        winner_user_id, containers_opened=1, wins=1, cars_obtained=1,
                        spent_total=bid_amount, container_profit=drop_value - bid_amount,
                        **({"earned_total": auto_sold_amount} if auto_sold_amount is not None else {}),
                    )
                    from app.services.battle_pass.progress import BattlePassProgressService

                    await BattlePassProgressService(self.session).mark_container_opened(winner_user_id, now)
                    record_event(
                        self.session, winner_user_id, "container_won",
                        {"auction_id": auction.id, "container_id": auction.container_id,
                         "car_id": car.id, "bid": bid_amount},
                    )
                    status = AuctionStatus.ENDED_WON
                else:
                    status = AuctionStatus.ENDED_NO_BIDS

                await auction_repo.finish(
                    auction.id, status, now,
                    result_car_id=car.id if car is not None else None,
                    result_user_car_id=user_car_id,
                )

                # Кик игроков, не поставивших ни одной ставки в этом раунде.
                bids = await AuctionBidRepository(self.session).list_for_auction(auction.id)
                bidder_user_ids = {bid.user_id for bid in bids}

                threshold = await self._kick_threshold()
                kicked_user_ids: list[int] = []
                active_members = await member_repo.list_active_members(auction.room_id)
                for member in active_members:
                    if member.user_id in bidder_user_ids:
                        continue
                    streak = await member_repo.increment_missed(auction.room_id, member.user_id)
                    if streak >= threshold:
                        await member_repo.mark_left(auction.room_id, member.user_id, now)
                        kicked_user_ids.append(member.user_id)

                # Следующий контейнер (или закрытие комнаты) — по тем же правилам,
                # что и первый запуск.
                remaining_members = await member_repo.list_active_members(auction.room_id)
                next_auction: Auction | None = None
                room_closed = False
                if not remaining_members or room.stop_requested:
                    await room_repo.mark_closed(auction.room_id, now)
                    room_closed = True
                else:
                    container = await self.container_service.pick_random_enabled_container(Language.RU)
                    ends_at = now + dt.timedelta(
                        seconds=await self._next_container_delay() + await self._timer_seconds()
                    )
                    next_auction = await auction_repo.create(
                        room_id=auction.room_id, container_id=container.id,
                        initial_bid=container.price, ends_at=ends_at,
                    )

        return FinalizeResult(
            room=room, auction=auction, winner_user_id=winner_user_id, bid_amount=bid_amount,
            car=car, user_car_id=user_car_id, auto_sold_amount=auto_sold_amount,
            kicked_user_ids=kicked_user_ids, next_auction=next_auction, room_closed=room_closed,
        )
