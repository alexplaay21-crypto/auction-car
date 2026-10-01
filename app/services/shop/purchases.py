"""Покупка лота в магазине (раздел 23 ТЗ). У магазина нет общего лимита
покупок; лот может содержать сразу несколько предметов — все выдаются
через services/rewards.py (единая логика с Battle Pass/Промокодами, не
дублируется). После покупки — хук рефералов 'первая покупка приглашённого'
(services/referrals/service.py, готов с этапа Referrals)."""
from __future__ import annotations

import datetime as dt

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import TransactionType
from app.core.exceptions import AppError
from app.database.transaction import atomic, distributed_lock, new_operation_id
from app.localization.manager import t
from app.models.purchase import Purchase
from app.models.user import User
from app.repositories.shop import PurchaseRepository, ShopLotItemRepository, ShopLotRepository, ShopSettingsRepository
from app.repositories.transaction import TransactionRepository
from app.repositories.user import UserRepository
from app.services.referrals.service import ReferralService
from app.services.rewards import grant_reward


class ShopPurchaseService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def purchase_lot(self, user: User, lot_id: int) -> Purchase:
        async with distributed_lock(f"shop_purchase:{user.id}:{lot_id}"):
            async with atomic(self.session):
                shop_settings = await ShopSettingsRepository(self.session).get_singleton()
                if not shop_settings.is_enabled:
                    raise AppError(t("shop_purchase_unavailable", user.language))

                lot = await ShopLotRepository(self.session).get(lot_id)
                now = dt.datetime.now(dt.timezone.utc)
                if lot is None or not lot.is_available:
                    raise AppError(t("shop_purchase_unavailable", user.language))
                if lot.available_from is not None and lot.available_from > now:
                    raise AppError(t("shop_purchase_unavailable", user.language))
                if lot.available_until is not None and lot.available_until < now:
                    raise AppError(t("shop_purchase_unavailable", user.language))

                user_repo = UserRepository(self.session)
                fresh = await user_repo.get(user.id)
                if fresh is None:
                    raise AppError(t("error_not_found", user.language))
                if fresh.balance < lot.price:
                    raise AppError(t("error_insufficient_funds", user.language))

                new_balance = await user_repo.increment_balance(user.id, -lot.price)
                await TransactionRepository(self.session).create(
                    user_id=user.id, type_=TransactionType.SHOP_PURCHASE, amount=-lot.price,
                    balance_after=new_balance, operation_id=new_operation_id(),
                    description=f"shop_purchase_lot_{lot_id}",
                )

                purchase = await PurchaseRepository(self.session).create(user.id, lot_id, lot.price)
                await self.session.flush()

                items = await ShopLotItemRepository(self.session).list_for_lot(lot_id)
                for item in items:
                    for _ in range(item.quantity):
                        await grant_reward(
                            self.session, user, item.item_type, item.payload,
                            f"shop_lot_{lot_id}_item_{item.id}",
                        )

                await ReferralService(self.session).on_purchase_made(user.id)

        user.balance = new_balance
        return purchase
