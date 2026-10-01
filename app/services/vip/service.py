"""VIP — постоянный статус (раздел 19 ТЗ). Цена и бонус мест гаража
настраиваются в админке через Setting, не хардкод. VIP = навсегда, снять
его через покупку/эту команду нельзя — только явной выдачей/отзывом в
админ-панели (этап Admin)."""
from __future__ import annotations

import datetime as dt

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import TransactionType, VipSource
from app.core.exceptions import AppError
from app.database.transaction import atomic, distributed_lock, new_operation_id
from app.localization.manager import t
from app.models.user import User
from app.repositories.garage import GarageRepository
from app.repositories.settings import SettingsRepository
from app.repositories.transaction import TransactionRepository
from app.repositories.user import UserRepository
from app.repositories.vip import VipGrantRepository

DEFAULT_VIP_PRICE = 500_000
DEFAULT_VIP_GARAGE_BONUS_SLOTS = 10
DEFAULT_GARAGE_START_CAPACITY = 15


class VipService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_price(self) -> int:
        return int(await SettingsRepository(self.session).get_value("vip_price", DEFAULT_VIP_PRICE))

    async def _garage_bonus_slots(self) -> int:
        return int(
            await SettingsRepository(self.session).get_value(
                "garage_vip_bonus_slots", DEFAULT_VIP_GARAGE_BONUS_SLOTS
            )
        )

    async def _grant_vip_effects(self, user_id: int, when: dt.datetime) -> None:
        """Общая часть выдачи VIP (покупка/выдача админом): статус +
        мгновенный бонус мест в гараже (раздел 12 ТЗ: 'VIP даёт +10 мест')."""
        await UserRepository(self.session).set_vip(user_id, True, when)

        garage_repo = GarageRepository(self.session)
        garage = await garage_repo.get_or_create(user_id, DEFAULT_GARAGE_START_CAPACITY)
        bonus = await self._garage_bonus_slots()
        await garage_repo.set_capacity(user_id, garage.capacity + bonus)

    async def purchase(self, user: User) -> int:
        """Покупка VIP за баланс. Возвращает уплаченную цену."""
        async with distributed_lock(f"vip:{user.id}"):
            async with atomic(self.session):
                user_repo = UserRepository(self.session)
                fresh = await user_repo.get(user.id)
                if fresh is None:
                    raise AppError(t("error_not_found", user.language))
                if fresh.is_vip:
                    raise AppError(t("vip_already_owned", user.language))

                price = await self.get_price()
                if fresh.balance < price:
                    raise AppError(t("error_insufficient_funds", user.language))

                now = dt.datetime.now(dt.timezone.utc)
                new_balance = await user_repo.increment_balance(user.id, -price)

                await TransactionRepository(self.session).create(
                    user_id=user.id, type_=TransactionType.VIP_PURCHASE, amount=-price,
                    balance_after=new_balance, operation_id=new_operation_id(),
                    description="vip_purchase",
                )
                await VipGrantRepository(self.session).create(
                    user_id=user.id, source=VipSource.PURCHASE, price_paid=price,
                )
                await self._grant_vip_effects(user.id, now)

        user.balance = new_balance
        user.is_vip = True
        user.vip_since = now
        return price

    async def grant(self, user_id: int, source: VipSource, granted_by: int | None = None) -> bool:
        """Выдача VIP без оплаты — любым источником (админ, промокод,
        награда Battle Pass/магазина). Возвращает False, если у игрока уже
        был VIP (no-op, повторно не выдаём)."""
        async with distributed_lock(f"vip:{user_id}"):
            async with atomic(self.session):
                user_repo = UserRepository(self.session)
                user = await user_repo.get(user_id)
                if user is None or user.is_vip:
                    return False

                now = dt.datetime.now(dt.timezone.utc)
                await VipGrantRepository(self.session).create(
                    user_id=user_id, source=source, granted_by=granted_by,
                )
                await self._grant_vip_effects(user_id, now)
        return True

    async def grant_by_admin(self, user_id: int, granted_by: int) -> bool:
        """Выдача VIP администратором без оплаты (этап Admin) — тонкая
        обёртка над grant() с фиксированным источником."""
        return await self.grant(user_id, VipSource.ADMIN_GRANT, granted_by)

    async def revoke(self, user_id: int) -> bool:
        """Снятие VIP администратором ('выдать/забрать VIP', раздел 27 ТЗ).
        Бонусные места гаража, выданные при получении VIP, не отбираются —
        только сам статус. Возвращает False, если VIP и так не было."""
        async with distributed_lock(f"vip:{user_id}"):
            async with atomic(self.session):
                user_repo = UserRepository(self.session)
                user = await user_repo.get(user_id)
                if user is None or not user.is_vip:
                    return False
                await user_repo.set_vip(user_id, False)
        return True
