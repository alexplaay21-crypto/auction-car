"""Ставки в аукционе (раздел 7-8 ТЗ).

Модель — эскроу: сумма ставки списывается с баланса сразу же (иначе
нельзя гарантировать, что к моменту победы у лидера действительно есть
деньги), а при перебитии ставки предыдущему лидеру она возвращается
(TransactionType.BET / BET_REFUND). Итоговая оплата победителя — это и
есть его последняя (эскроу) ставка, отдельного списания при открытии
контейнера не требуется.

Минимальная следующая ставка = current_bid + шаг. Так как current_bid
изначально равен initial_bid, эта же формула покрывает и требование
'первая ставка не меньше initial_bid + шаг' без специального случая."""
from __future__ import annotations

import datetime as dt

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import TransactionType
from app.core.exceptions import AppError
from app.database.transaction import atomic, new_operation_id
from app.localization.manager import t
from app.models.auction import Auction
from app.models.user import User
from app.repositories.auction import AuctionBidRepository, AuctionRepository
from app.repositories.room import RoomMemberRepository
from app.repositories.settings import SettingsRepository
from app.repositories.transaction import TransactionRepository
from app.repositories.user import UserRepository, UserStatsRepository
from app.services.auctions.locks import auction_lock

DEFAULT_BET_STEP = 500
DEFAULT_AUCTION_TIMER_SECONDS = 30


class BiddingService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def _bet_step(self) -> int:
        return int(await SettingsRepository(self.session).get_value("bet_step_default", DEFAULT_BET_STEP))

    async def _timer_seconds(self) -> int:
        return int(
            await SettingsRepository(self.session).get_value(
                "auction_timer_seconds", DEFAULT_AUCTION_TIMER_SECONDS
            )
        )

    async def place_bid(self, user: User, room_id: int, amount: int) -> Auction:
        async with auction_lock(room_id):
            async with atomic(self.session):
                auction_repo = AuctionRepository(self.session)
                auction = await auction_repo.get_active_for_room(room_id)
                if auction is None:
                    raise AppError(t("error_not_found", user.language))

                member = await RoomMemberRepository(self.session).get_member(room_id, user.id)
                if member is None or member.left_at is not None:
                    raise AppError(t("error_permission_denied", user.language))

                step = await self._bet_step()
                min_amount = auction.current_bid + step
                if amount < min_amount:
                    raise AppError(t("bet_too_low", user.language, min_amount=min_amount))

                user_repo = UserRepository(self.session)
                fresh_user = await user_repo.get(user.id)
                if fresh_user is None:
                    raise AppError(t("error_not_found", user.language))

                previous_leader_id = auction.current_leader_id
                previous_bid = auction.current_bid
                tx_repo = TransactionRepository(self.session)

                if previous_leader_id == user.id:
                    # Игрок перебивает собственную ставку — доплачивает разницу.
                    delta = amount - previous_bid
                    if fresh_user.balance < delta:
                        raise AppError(t("error_insufficient_funds", user.language))
                    new_balance = await user_repo.increment_balance(user.id, -delta)
                    await tx_repo.create(
                        user_id=user.id, type_=TransactionType.BET, amount=-delta,
                        balance_after=new_balance, operation_id=new_operation_id(),
                        description=f"bid_raise_auction_{auction.id}",
                    )
                else:
                    if fresh_user.balance < amount:
                        raise AppError(t("error_insufficient_funds", user.language))
                    new_balance = await user_repo.increment_balance(user.id, -amount)
                    await tx_repo.create(
                        user_id=user.id, type_=TransactionType.BET, amount=-amount,
                        balance_after=new_balance, operation_id=new_operation_id(),
                        description=f"bid_auction_{auction.id}",
                    )
                    if previous_leader_id is not None:
                        prev_new_balance = await user_repo.increment_balance(previous_leader_id, previous_bid)
                        await tx_repo.create(
                            user_id=previous_leader_id, type_=TransactionType.BET_REFUND,
                            amount=previous_bid, balance_after=prev_new_balance,
                            operation_id=new_operation_id(), description=f"outbid_auction_{auction.id}",
                        )

                now = dt.datetime.now(dt.timezone.utc)
                new_ends_at = now + dt.timedelta(seconds=await self._timer_seconds())

                await auction_repo.apply_bid(auction.id, user.id, amount, new_ends_at)
                await AuctionBidRepository(self.session).add_bid(auction.id, user.id, amount)
                await RoomMemberRepository(self.session).reset_missed(room_id, user.id)
                await UserStatsRepository(self.session).increment(user.id, bids_made=1)

                auction.current_bid = amount
                auction.current_leader_id = user.id
                auction.ends_at = new_ends_at

        user.balance = new_balance
        return auction
