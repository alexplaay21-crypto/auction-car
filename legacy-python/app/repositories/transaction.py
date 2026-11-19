"""Доступ к денежному журналу и сделкам: Transaction, Sale, Transfer."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import select, update

from app.core.enums import SaleStatus, TransactionType
from app.models.sale import Sale
from app.models.transaction import Transaction
from app.models.transfer import Transfer
from app.repositories.base import BaseRepository
from app.repositories.history import record_event


class TransactionRepository(BaseRepository[Transaction]):
    model = Transaction

    async def get_by_operation_id(self, operation_id: str) -> Transaction | None:
        stmt = select(Transaction).where(Transaction.operation_id == operation_id)
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def create(
        self, user_id: int, type_: TransactionType, amount: int, balance_after: int,
        operation_id: str | None = None, description: str | None = None,
    ) -> Transaction:
        tx = Transaction(
            user_id=user_id, type=type_, amount=amount, balance_after=balance_after,
            operation_id=operation_id, description=description,
        )
        self.add(tx)  # BaseRepository.add() — просто регистрирует объект в сессии
        record_event(
            self.session, user_id, f"money_{type_.value}",
            {"amount": amount, "balance_after": balance_after, "note": description},
            operation_id=operation_id,
        )
        return tx

    async def list_for_user(self, user_id: int, limit: int = 50, offset: int = 0) -> list[Transaction]:
        stmt = (
            select(Transaction)
            .where(Transaction.user_id == user_id)
            .order_by(Transaction.id.desc())
            .limit(limit)
            .offset(offset)
        )
        return list((await self.session.execute(stmt)).scalars())


class SaleRepository(BaseRepository[Sale]):
    model = Sale

    async def create_offer(
        self, seller_id: int, buyer_id: int, user_car_id: int, price: int, commission_rate: float,
    ) -> Sale:
        sale = Sale(
            seller_id=seller_id, buyer_id=buyer_id, user_car_id=user_car_id,
            price=price, commission_rate=commission_rate, status=SaleStatus.PENDING,
        )
        self.add(sale)
        return sale

    async def list_pending_for_buyer(self, buyer_id: int) -> list[Sale]:
        stmt = select(Sale).where(Sale.buyer_id == buyer_id, Sale.status == SaleStatus.PENDING)
        return list((await self.session.execute(stmt)).scalars())

    async def decline_pending_for_car(self, user_car_id: int, when: dt.datetime) -> None:
        await self.session.execute(
            update(Sale)
            .where(Sale.user_car_id == user_car_id, Sale.status == SaleStatus.PENDING)
            .values(status=SaleStatus.DECLINED, resolved_at=when)
        )

    async def resolve(self, sale_id: int, status: SaleStatus, when: dt.datetime) -> None:
        await self.session.execute(
            update(Sale).where(Sale.id == sale_id).values(status=status, resolved_at=when)
        )

    async def expire_older_than(self, before: dt.datetime) -> list[Sale]:
        stmt = select(Sale).where(Sale.status == SaleStatus.PENDING, Sale.created_at < before)
        pending = list((await self.session.execute(stmt)).scalars())
        for sale in pending:
            sale.status = SaleStatus.EXPIRED
            sale.resolved_at = dt.datetime.now(dt.timezone.utc)
        return pending


class TransferRepository(BaseRepository[Transfer]):
    model = Transfer

    async def create(
        self, from_user_id: int, to_user_id: int, amount: int,
        commission_rate: float, commission_amount: int,
    ) -> Transfer:
        transfer = Transfer(
            from_user_id=from_user_id, to_user_id=to_user_id, amount=amount,
            commission_rate=commission_rate, commission_amount=commission_amount,
        )
        self.add(transfer)
        return transfer
