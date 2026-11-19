"""Статистика для админки (раздел 27 ТЗ). Только чтение: агрегаты по
таблицам игры за выбранный период. Ничего не хардкодит и не меняет данные."""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass

from sqlalchemy import Numeric, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import (
    AuctionStatus, BroadcastStatus, SaleStatus, TransactionType,
)
from app.models.auction import Auction
from app.models.auction_bid import AuctionBid
from app.models.battle_pass_progress import BattlePassProgress
from app.models.broadcast import Broadcast
from app.models.car import Car
from app.models.garage import UserCar
from app.models.group import Group
from app.models.history import HistoryEvent
from app.models.promo_redemption import PromoRedemption
from app.models.purchase import Purchase
from app.models.referral import Referral
from app.models.sale import Sale
from app.models.transaction import Transaction
from app.models.transfer import Transfer
from app.models.user import User

SYSTEM_ERROR_EVENT = "system_error"

# Периоды: ключ -> длительность (None = за всё время).
PERIODS: dict[str, dt.timedelta | None] = {
    "day": dt.timedelta(days=1),
    "week": dt.timedelta(days=7),
    "month": dt.timedelta(days=30),
    "all": None,
}

# Переводы между игроками не создают и не уничтожают деньги в экономике —
# в «выдано/потрачено» не входят (комиссия учитывается отдельно).
_P2P_TYPES = (
    TransactionType.TRANSFER_IN, TransactionType.TRANSFER_OUT,
    TransactionType.SELL_PLAYER_INCOME, TransactionType.BUY_PLAYER_CAR,
    TransactionType.BET_REFUND,
)


@dataclass(slots=True)
class StatsReport:
    players: int
    active: int
    new: int
    vip: int
    banned: int
    containers: int
    bets: int
    wins: int
    cars: int
    cars_sold: int
    player_sales: int
    purchases: int
    purchases_sum: int
    money_issued: int
    money_spent: int
    commissions: int
    referrals: int
    bp_buyers: int
    promo_activations: int
    errors: int
    groups: int
    broadcasts: int


class StatisticsService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def _scalar(self, stmt) -> int:
        value = (await self.session.execute(stmt)).scalar()
        return int(value or 0)

    @staticmethod
    def _since(period: str) -> dt.datetime | None:
        delta = PERIODS.get(period)
        return None if delta is None else dt.datetime.now(dt.timezone.utc) - delta

    @staticmethod
    def _where(column, since: dt.datetime | None) -> list:
        return [] if since is None else [column >= since]

    async def build(self, period: str) -> StatsReport:
        since = self._since(period)
        w = self._where
        sc = self._scalar

        players = await sc(select(func.count(User.id)))
        vip = await sc(select(func.count(User.id)).where(User.is_vip.is_(True)))
        banned = await sc(select(func.count(User.id)).where(User.is_banned.is_(True)))
        # Активные: были в боте в выбранном периоде (для «всего» — за 30 дней).
        active_since = since or (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=30))
        active = await sc(select(func.count(User.id)).where(User.last_seen_at >= active_since))
        new = await sc(select(func.count(User.id)).where(*w(User.created_at, since)))

        containers = await sc(
            select(func.count(Auction.id)).where(
                Auction.status == AuctionStatus.ENDED_WON, *w(Auction.ended_at, since)
            )
        )
        bets = await sc(select(func.count(AuctionBid.id)).where(*w(AuctionBid.created_at, since)))

        cars = await sc(select(func.count(UserCar.id)).where(*w(UserCar.obtained_at, since)))
        cars_sold = await sc(
            select(func.count(UserCar.id)).where(
                UserCar.is_sold.is_(True), UserCar.sold_price.is_not(None), *w(UserCar.sold_at, since)
            )
        )
        player_sales = await sc(
            select(func.count(Sale.id)).where(
                Sale.status == SaleStatus.ACCEPTED, *w(Sale.resolved_at, since)
            )
        )

        purchases = await sc(select(func.count(Purchase.id)).where(*w(Purchase.created_at, since)))
        purchases_sum = await sc(
            select(func.coalesce(func.sum(Purchase.price_paid), 0)).where(*w(Purchase.created_at, since))
        )

        issued = await sc(
            select(func.coalesce(func.sum(Transaction.amount), 0)).where(
                Transaction.amount > 0, Transaction.type.notin_(_P2P_TYPES),
                *w(Transaction.created_at, since),
            )
        )
        spent = await sc(
            select(func.coalesce(func.sum(-Transaction.amount), 0)).where(
                Transaction.amount < 0, Transaction.type.notin_(_P2P_TYPES),
                *w(Transaction.created_at, since),
            )
        )

        # Комиссии: переводы + продажи игроку + продажи государству/быстрый выкуп
        # (разница между каталожной ценой и полученной суммой).
        fee_transfers = await sc(
            select(func.coalesce(func.sum(Transfer.commission_amount), 0)).where(
                *w(Transfer.created_at, since)
            )
        )
        fee_sales = await sc(
            select(func.coalesce(func.sum(cast(Sale.price * Sale.commission_rate, Numeric(20, 0))), 0)).where(
                Sale.status == SaleStatus.ACCEPTED, *w(Sale.resolved_at, since)
            )
        )
        fee_state = await sc(
            select(func.coalesce(func.sum(Car.price - UserCar.sold_price), 0))
            .select_from(UserCar).join(Car, Car.id == UserCar.car_id)
            .where(UserCar.is_sold.is_(True), UserCar.sold_price.is_not(None),
                   *w(UserCar.sold_at, since))
        )

        referrals = await sc(select(func.count(Referral.id)).where(*w(Referral.created_at, since)))
        bp_buyers = await sc(
            select(func.count(BattlePassProgress.id)).where(
                BattlePassProgress.purchased_at.is_not(None), *w(BattlePassProgress.purchased_at, since)
            )
        )
        promo = await sc(
            select(func.count(PromoRedemption.id)).where(*w(PromoRedemption.created_at, since))
        )
        errors = await sc(
            select(func.count(HistoryEvent.id)).where(
                HistoryEvent.event_type == SYSTEM_ERROR_EVENT, *w(HistoryEvent.created_at, since)
            )
        )
        groups = await sc(select(func.count(Group.id)).where(Group.is_active.is_(True)))
        broadcasts = await sc(
            select(func.count(Broadcast.id)).where(Broadcast.status == BroadcastStatus.SENT)
        )

        return StatsReport(
            players=players, active=active, new=new, vip=vip, banned=banned,
            containers=containers, bets=bets, wins=containers, cars=cars,
            cars_sold=cars_sold, player_sales=player_sales,
            purchases=purchases, purchases_sum=purchases_sum,
            money_issued=issued, money_spent=spent,
            commissions=fee_transfers + fee_sales + fee_state,
            referrals=referrals, bp_buyers=bp_buyers, promo_activations=promo,
            errors=errors, groups=groups, broadcasts=broadcasts,
        )
