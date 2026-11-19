"""Низкоуровневая операция 'изменить баланс + записать в ledger' —
переиспользуется transactions.py и другими сервисами (Garage, Profile,
Auctions уже используют похожий паттерн напрямую; этот хелпер сокращает
повторение для новых операций).

Не оборачивает в atomic()/lock — это обязан сделать вызывающий код,
предварительно проверив достаточность средств при списании."""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import TransactionType
from app.database.transaction import new_operation_id
from app.repositories.transaction import TransactionRepository
from app.repositories.user import UserRepository


async def adjust_balance(
    session: AsyncSession, user_id: int, delta: int, type_: TransactionType, description: str,
) -> int:
    new_balance = await UserRepository(session).increment_balance(user_id, delta)
    await TransactionRepository(session).create(
        user_id=user_id, type_=type_, amount=delta, balance_after=new_balance,
        operation_id=new_operation_id(), description=description,
    )
    return new_balance
