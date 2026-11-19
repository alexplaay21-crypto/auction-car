"""Доступ к данным аукциона: Auction, AuctionBid.

Ставки должны переживать рестарт — вся нужная для восстановления информация
(current_bid, current_leader_id, ends_at, status) читается/пишется прямо
здесь; блокировка от гонок обеспечивается вызывающим сервисом через
database/transaction.py:distributed_lock()."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import desc, func, select, update

from app.core.enums import AuctionStatus
from app.models.auction import Auction
from app.models.auction_bid import AuctionBid
from app.repositories.base import BaseRepository
from app.repositories.history import record_event


class AuctionRepository(BaseRepository[Auction]):
    model = Auction

    async def get_active_for_room(self, room_id: int) -> Auction | None:
        stmt = select(Auction).where(Auction.room_id == room_id, Auction.status == AuctionStatus.ACTIVE)
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def list_active(self) -> list[Auction]:
        """Все активные аукционы во всех комнатах — используется при рестарте
        процесса, чтобы восстановить таймеры (см. services/auctions/recovery.py)."""
        stmt = select(Auction).where(Auction.status == AuctionStatus.ACTIVE)
        return list((await self.session.execute(stmt)).scalars())

    async def create(self, room_id: int, container_id: int, initial_bid: int, ends_at: dt.datetime) -> Auction:
        auction = Auction(
            room_id=room_id,
            container_id=container_id,
            status=AuctionStatus.ACTIVE,
            initial_bid=initial_bid,
            current_bid=initial_bid,
            ends_at=ends_at,
            started_at=func.now(),
        )
        self.add(auction)
        await self.flush()
        return auction

    async def apply_bid(self, auction_id: int, user_id: int, amount: int, new_ends_at: dt.datetime) -> None:
        """Атомарно двигает текущую ставку/лидера/таймер. Вызывающий сервис
        обязан сначала под локом убедиться, что amount валиден (>= минимального шага)."""
        await self.session.execute(
            update(Auction)
            .where(Auction.id == auction_id)
            .values(current_bid=amount, current_leader_id=user_id, ends_at=new_ends_at)
        )

    async def finish(
        self,
        auction_id: int,
        status: AuctionStatus,
        when: dt.datetime,
        result_car_id: int | None = None,
        result_user_car_id: int | None = None,
    ) -> None:
        await self.session.execute(
            update(Auction)
            .where(Auction.id == auction_id)
            .values(
                status=status,
                ended_at=when,
                result_car_id=result_car_id,
                result_user_car_id=result_user_car_id,
            )
        )


class AuctionBidRepository(BaseRepository[AuctionBid]):
    model = AuctionBid

    async def add_bid(self, auction_id: int, user_id: int, amount: int) -> AuctionBid:
        bid = AuctionBid(auction_id=auction_id, user_id=user_id, amount=amount)
        self.add(bid)
        record_event(self.session, user_id, "bet", {"auction_id": auction_id, "amount": amount})
        return bid

    async def list_for_auction(self, auction_id: int) -> list[AuctionBid]:
        stmt = select(AuctionBid).where(AuctionBid.auction_id == auction_id).order_by(AuctionBid.id)
        return list((await self.session.execute(stmt)).scalars())

    async def last_bidder(self, auction_id: int) -> int | None:
        stmt = (
            select(AuctionBid.user_id)
            .where(AuctionBid.auction_id == auction_id)
            .order_by(desc(AuctionBid.id))
            .limit(1)
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def count_for_user(self, user_id: int) -> int:
        stmt = select(func.count()).select_from(AuctionBid).where(AuctionBid.user_id == user_id)
        return (await self.session.execute(stmt)).scalar_one()
