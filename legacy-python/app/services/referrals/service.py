"""Рефералы (раздел 21 ТЗ): бонус пригласившему и приглашённому при
регистрации по реферальной ссылке, доп. бонус пригласившему при первой
покупке приглашённого, награда (Epic-машина) за каждые 10 приглашённых.
Один и тот же Telegram ID нельзя засчитать повторно — Referral.invited_id
уникален (репозиторий/БД не даст создать вторую запись)."""
from __future__ import annotations

import datetime as dt
import random

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import ObtainedFrom, Rarity, TransactionType
from app.database.transaction import atomic, distributed_lock, new_operation_id
from app.models.user import User
from app.repositories.car import CarRepository
from app.repositories.referral import ReferralRepository
from app.repositories.settings import SettingsRepository
from app.repositories.transaction import TransactionRepository
from app.repositories.user import UserRepository, UserStatsRepository

DEFAULT_INVITER_BONUS = 10_000
DEFAULT_INVITED_BONUS = 5_000
DEFAULT_FIRST_PURCHASE_BONUS = 30_000
DEFAULT_EPIC_THRESHOLD = 10

REFERRAL_PREFIX = "ref_"


def build_deep_link_payload(inviter_id: int) -> str:
    return f"{REFERRAL_PREFIX}{inviter_id}"


def parse_inviter_id(payload: str | None) -> int | None:
    if not payload or not payload.startswith(REFERRAL_PREFIX):
        return None
    tail = payload[len(REFERRAL_PREFIX):]
    return int(tail) if tail.isdigit() else None


class ReferralService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def _amounts(self) -> tuple[int, int, int, int]:
        settings_repo = SettingsRepository(self.session)
        inviter_bonus = int(await settings_repo.get_value("referral_inviter_bonus", DEFAULT_INVITER_BONUS))
        invited_bonus = int(await settings_repo.get_value("referral_invited_bonus", DEFAULT_INVITED_BONUS))
        first_purchase_bonus = int(
            await settings_repo.get_value("referral_first_purchase_bonus", DEFAULT_FIRST_PURCHASE_BONUS)
        )
        epic_threshold = int(await settings_repo.get_value("referral_epic_threshold", DEFAULT_EPIC_THRESHOLD))
        return inviter_bonus, invited_bonus, first_purchase_bonus, epic_threshold

    async def _grant_epic_car(self, user_id: int) -> None:
        cars = await CarRepository(self.session).list_by_rarity(Rarity.EPIC)
        if not cars:
            return
        car = random.choice(cars)
        user = await UserRepository(self.session).get(user_id)
        if user is None:
            return

        from app.services.garage.service import GarageService  # локальный импорт — без цикла модулей

        await GarageService(self.session).add_car_to_garage(
            user, car.id, car.price, ObtainedFrom.PROMO, dt.datetime.now(dt.timezone.utc),
        )

    async def register_referral(self, inviter_id: int, invited: User) -> bool:
        """Регистрирует приглашение при первом /start приглашённого по
        реферальной ссылке. False — если уже зарегистрирован, инвайтер не
        найден, или игрок 'пригласил сам себя'."""
        if inviter_id == invited.id:
            return False

        async with distributed_lock(f"referral:{invited.id}"):
            async with atomic(self.session):
                referral_repo = ReferralRepository(self.session)
                if await referral_repo.get_by_invited(invited.id) is not None:
                    return False

                inviter = await UserRepository(self.session).get(inviter_id)
                if inviter is None:
                    return False

                inviter_bonus, invited_bonus, _, epic_threshold = await self._amounts()

                referral = await referral_repo.create(inviter_id, invited.id)

                user_repo = UserRepository(self.session)
                tx_repo = TransactionRepository(self.session)

                inviter_new_balance = await user_repo.increment_balance(inviter_id, inviter_bonus)
                await tx_repo.create(
                    user_id=inviter_id, type_=TransactionType.REFERRAL_BONUS, amount=inviter_bonus,
                    balance_after=inviter_new_balance, operation_id=new_operation_id(),
                    description=f"referral_inviter_{invited.id}",
                )
                referral.inviter_bonus_paid = True

                invited_new_balance = await user_repo.increment_balance(invited.id, invited_bonus)
                await tx_repo.create(
                    user_id=invited.id, type_=TransactionType.REFERRAL_BONUS, amount=invited_bonus,
                    balance_after=invited_new_balance, operation_id=new_operation_id(),
                    description=f"referral_invited_{inviter_id}",
                )
                referral.invited_bonus_paid = True

                await UserStatsRepository(self.session).increment(inviter_id, referrals_count=1)

                count = await referral_repo.count_for_inviter(inviter_id)
                if count > 0 and count % epic_threshold == 0:
                    await self._grant_epic_car(inviter_id)

        invited.balance = invited_new_balance
        return True

    async def on_purchase_made(self, invited_user_id: int) -> None:
        """Вызывается после ЛЮБОЙ покупки игрока (магазин, BP, VIP — этапы
        Shop/Battle Pass/VIP) — начисляет пригласившему доп. бонус за
        'первую покупку' приглашённого, ровно один раз (флаг в Referral)."""
        async with distributed_lock(f"referral:{invited_user_id}"):
            async with atomic(self.session):
                referral_repo = ReferralRepository(self.session)
                referral = await referral_repo.get_by_invited(invited_user_id)
                if referral is None or referral.first_purchase_bonus_paid:
                    return

                _, _, first_purchase_bonus, _ = await self._amounts()
                user_repo = UserRepository(self.session)
                new_balance = await user_repo.increment_balance(referral.inviter_id, first_purchase_bonus)
                await TransactionRepository(self.session).create(
                    user_id=referral.inviter_id, type_=TransactionType.REFERRAL_BONUS,
                    amount=first_purchase_bonus, balance_after=new_balance,
                    operation_id=new_operation_id(),
                    description=f"referral_first_purchase_{invited_user_id}",
                )
                await referral_repo.mark_first_purchase_bonus_paid(referral.id)
