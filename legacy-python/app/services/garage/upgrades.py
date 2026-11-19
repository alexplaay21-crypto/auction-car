"""Расширение гаража по тарифам (раздел 12 ТЗ). Тарифы и максимум без/с
VIP полностью настраиваются в админке (garage_upgrade_tiers, Setting).
Значения из ТЗ (20/$25000 ... 50/$500000, макс 50 без VIP / 60 с VIP,
VIP даёт +10 мест) — это только сид по умолчанию, не хардкод в логике."""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import TransactionType
from app.core.exceptions import AppError
from app.database.transaction import atomic, distributed_lock, new_operation_id
from app.localization.manager import t
from app.models.user import User
from app.repositories.garage import GarageRepository, GarageUpgradeTierRepository
from app.repositories.settings import SettingsRepository
from app.repositories.transaction import TransactionRepository
from app.repositories.user import UserRepository

DEFAULT_MAX_CAPACITY_NO_VIP = 50
DEFAULT_VIP_BONUS_SLOTS = 10


class GarageUpgradeService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def _max_capacity(self, is_vip: bool) -> int:
        settings_repo = SettingsRepository(self.session)
        max_no_vip = await settings_repo.get_value("garage_max_capacity_no_vip", DEFAULT_MAX_CAPACITY_NO_VIP)
        if not is_vip:
            return int(max_no_vip)
        vip_bonus = await settings_repo.get_value("garage_vip_bonus_slots", DEFAULT_VIP_BONUS_SLOTS)
        return int(max_no_vip) + int(vip_bonus)

    async def get_next_tier_or_none(self, user: User):
        garage = await GarageRepository(self.session).get_or_create(user.id, 15)
        max_capacity = await self._max_capacity(user.is_vip)
        if garage.capacity >= max_capacity:
            return None
        tier = await GarageUpgradeTierRepository(self.session).get_next_tier(garage.capacity)
        if tier is None or tier.new_capacity > max_capacity:
            return None
        return tier

    async def upgrade(self, user: User) -> int:
        """Покупает следующий тариф расширения. Возвращает новую вместимость."""
        async with distributed_lock(f"garage_upgrade:{user.id}"):
            async with atomic(self.session):
                garage_repo = GarageRepository(self.session)
                garage = await garage_repo.get_or_create(user.id, 15)

                max_capacity = await self._max_capacity(user.is_vip)
                if garage.capacity >= max_capacity:
                    raise AppError(t("garage_upgrade_max", user.language))

                tier = await GarageUpgradeTierRepository(self.session).get_next_tier(garage.capacity)
                if tier is None or tier.new_capacity > max_capacity:
                    raise AppError(t("garage_upgrade_max", user.language))

                user_repo = UserRepository(self.session)
                fresh_user = await user_repo.get(user.id)
                if fresh_user is None:
                    raise AppError(t("error_not_found", user.language))
                if fresh_user.balance < tier.price:
                    raise AppError(t("error_insufficient_funds", user.language))

                new_balance = await user_repo.increment_balance(user.id, -tier.price)
                await garage_repo.set_capacity(user.id, tier.new_capacity)

                await TransactionRepository(self.session).create(
                    user_id=user.id,
                    type_=TransactionType.GARAGE_UPGRADE,
                    amount=-tier.price,
                    balance_after=new_balance,
                    operation_id=new_operation_id(),
                    description=f"garage_upgrade_to_{tier.new_capacity}",
                )

        user.balance = new_balance
        return tier.new_capacity
