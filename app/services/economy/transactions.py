"""Экономические операции игрок<->государство и игрок<->игрок
(разделы 14, 15, 16 ТЗ): продажа государству, продажа другому игроку
(с офером на принятие/отклонение), перевод денег. Всё — атомарно, под
distributed_lock, с проверкой достаточности средств и настраиваемой
комиссией (services/economy/commissions.py, не хардкод)."""
from __future__ import annotations

import datetime as dt

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import SaleStatus, TransactionType
from app.core.exceptions import AppError
from app.database.transaction import atomic, distributed_lock, new_operation_id
from app.localization.manager import t
from app.models.car import Car
from app.models.sale import Sale
from app.models.user import User
from app.repositories.car import CarRepository
from app.repositories.garage import UserCarRepository
from app.repositories.transaction import SaleRepository, TransactionRepository, TransferRepository
from app.repositories.user import UserRepository, UserStatsRepository
from app.services.economy.commissions import get_commission_rate

MIN_TRANSFER_AMOUNT = 1


async def resolve_user_ref(session: AsyncSession, raw: str, language) -> User:
    """PLAYER_ID_OR_USERNAME -> User. Принимает и '@username', и 'username'
    без собаки, и числовой Telegram ID (разделы 15-16 ТЗ)."""
    raw = raw.strip()
    user_repo = UserRepository(session)
    user = await user_repo.get(int(raw)) if raw.isdigit() else await user_repo.get_by_username(raw)
    if user is None:
        raise AppError(t("error_not_found", language))
    return user


class EconomyService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def sell_to_state(self, user: User, user_car_id: int) -> int:
        """/sellcar — продажа машины государству (раздел 14 ТЗ)."""
        async with distributed_lock(f"user_car:{user_car_id}"):
            async with atomic(self.session):
                user_car_repo = UserCarRepository(self.session)
                user_car = await user_car_repo.get(user_car_id)
                if user_car is None or user_car.user_id != user.id or user_car.is_sold:
                    raise AppError(t("error_not_found", user.language))

                car = await CarRepository(self.session).get(user_car.car_id)
                if car is None:
                    raise AppError(t("error_not_found", user.language))

                rate = await get_commission_rate(self.session, "commission_sell_state", user.is_vip)
                amount = round(car.price * (1 - rate))
                when = dt.datetime.now(dt.timezone.utc)

                await user_car_repo.mark_sold(user_car_id, amount, when)

                user_repo = UserRepository(self.session)
                new_balance = await user_repo.increment_balance(user.id, amount)
                await TransactionRepository(self.session).create(
                    user_id=user.id, type_=TransactionType.SELL_STATE, amount=amount,
                    balance_after=new_balance, operation_id=new_operation_id(),
                    description=f"sell_state_{user_car_id}",
                )
                await UserStatsRepository(self.session).increment(
                    user.id, cars_sold=1, earned_total=amount,
                )

        user.balance = new_balance
        return amount

    async def offer_sell_to_player(
        self, seller: User, user_car_id: int, buyer_ref: str, price: int
    ) -> tuple[Sale, User, Car]:
        """/sell — предложение продажи другому игроку (раздел 15 ТЗ)."""
        buyer = await resolve_user_ref(self.session, buyer_ref, seller.language)
        if buyer.id == seller.id:
            raise AppError(t("error_permission_denied", seller.language))

        async with distributed_lock(f"user_car:{user_car_id}"):
            async with atomic(self.session):
                user_car_repo = UserCarRepository(self.session)
                user_car = await user_car_repo.get(user_car_id)
                if user_car is None or user_car.user_id != seller.id or user_car.is_sold:
                    raise AppError(t("error_not_found", seller.language))

                car = await CarRepository(self.session).get(user_car.car_id)
                if car is None:
                    raise AppError(t("error_not_found", seller.language))

                rate = await get_commission_rate(self.session, "commission_sell_player", seller.is_vip)
                sale = await SaleRepository(self.session).create_offer(
                    seller_id=seller.id, buyer_id=buyer.id, user_car_id=user_car_id,
                    price=price, commission_rate=rate,
                )
                await self.session.flush()

        return sale, buyer, car

    async def accept_sale_offer(self, buyer: User, sale_id: int) -> tuple[Sale, Car]:
        async with distributed_lock(f"sale:{sale_id}"):
            async with atomic(self.session):
                sale_repo = SaleRepository(self.session)
                sale = await sale_repo.get(sale_id)
                if sale is None or sale.buyer_id != buyer.id or sale.status != SaleStatus.PENDING:
                    raise AppError(t("error_not_found", buyer.language))

                user_car_repo = UserCarRepository(self.session)
                user_car = await user_car_repo.get(sale.user_car_id)
                if user_car is None or user_car.is_sold or user_car.user_id != sale.seller_id:
                    raise AppError(t("error_not_found", buyer.language))

                user_repo = UserRepository(self.session)
                fresh_buyer = await user_repo.get(buyer.id)
                if fresh_buyer is None or fresh_buyer.balance < sale.price:
                    raise AppError(t("error_insufficient_funds", buyer.language))

                buyer_new_balance = await user_repo.increment_balance(buyer.id, -sale.price)
                await TransactionRepository(self.session).create(
                    user_id=buyer.id, type_=TransactionType.BUY_PLAYER_CAR, amount=-sale.price,
                    balance_after=buyer_new_balance, operation_id=new_operation_id(),
                    description=f"buy_car_{user_car.id}",
                )

                seller_income = round(sale.price * (1 - sale.commission_rate))
                seller_new_balance = await user_repo.increment_balance(sale.seller_id, seller_income)
                await TransactionRepository(self.session).create(
                    user_id=sale.seller_id, type_=TransactionType.SELL_PLAYER_INCOME,
                    amount=seller_income, balance_after=seller_new_balance,
                    operation_id=new_operation_id(), description=f"sell_car_to_player_{user_car.id}",
                )

                await user_car_repo.transfer_owner(user_car.id, buyer.id)
                now = dt.datetime.now(dt.timezone.utc)
                await sale_repo.resolve(sale.id, SaleStatus.ACCEPTED, now)

                car = await CarRepository(self.session).get(user_car.car_id)

                stats_repo = UserStatsRepository(self.session)
                await stats_repo.increment(sale.seller_id, cars_sold=1, earned_total=seller_income)
                await stats_repo.increment(buyer.id, cars_obtained=1, spent_total=sale.price)

        buyer.balance = buyer_new_balance
        return sale, car

    async def decline_sale_offer(self, buyer: User, sale_id: int) -> Sale:
        async with atomic(self.session):
            sale_repo = SaleRepository(self.session)
            sale = await sale_repo.get(sale_id)
            if sale is None or sale.buyer_id != buyer.id or sale.status != SaleStatus.PENDING:
                raise AppError(t("error_not_found", buyer.language))
            await sale_repo.resolve(sale.id, SaleStatus.DECLINED, dt.datetime.now(dt.timezone.utc))
        return sale

    async def transfer_money(self, sender: User, recipient_ref: str, amount: int) -> tuple[int, User]:
        """/transfer — перевод денег другому игроку (раздел 16 ТЗ)."""
        if amount < MIN_TRANSFER_AMOUNT:
            raise AppError(t("error_insufficient_funds", sender.language))

        recipient = await resolve_user_ref(self.session, recipient_ref, sender.language)
        if recipient.id == sender.id:
            raise AppError(t("error_permission_denied", sender.language))

        lock_key = f"transfer:{min(sender.id, recipient.id)}:{max(sender.id, recipient.id)}"
        async with distributed_lock(lock_key):
            async with atomic(self.session):
                user_repo = UserRepository(self.session)
                fresh_sender = await user_repo.get(sender.id)
                if fresh_sender is None or fresh_sender.balance < amount:
                    raise AppError(t("error_insufficient_funds", sender.language))

                rate = await get_commission_rate(self.session, "commission_transfer", sender.is_vip)
                commission_amount = round(amount * rate)
                net_amount = amount - commission_amount

                sender_new_balance = await user_repo.increment_balance(sender.id, -amount)
                await TransactionRepository(self.session).create(
                    user_id=sender.id, type_=TransactionType.TRANSFER_OUT, amount=-amount,
                    balance_after=sender_new_balance, operation_id=new_operation_id(),
                    description=f"transfer_to_{recipient.id}",
                )

                recipient_new_balance = await user_repo.increment_balance(recipient.id, net_amount)
                await TransactionRepository(self.session).create(
                    user_id=recipient.id, type_=TransactionType.TRANSFER_IN, amount=net_amount,
                    balance_after=recipient_new_balance, operation_id=new_operation_id(),
                    description=f"transfer_from_{sender.id}",
                )

                await TransferRepository(self.session).create(
                    from_user_id=sender.id, to_user_id=recipient.id, amount=amount,
                    commission_rate=rate, commission_amount=commission_amount,
                )

        sender.balance = sender_new_balance
        return net_amount, recipient
