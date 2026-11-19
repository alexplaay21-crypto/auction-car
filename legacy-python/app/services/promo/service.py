"""Активация промокодов (раздел 24 ТЗ): проверка активен/выключен, срока
действия, лимита активаций, повторного использования одним игроком.
Выдача наград — через services/rewards.py (единая логика с Battle
Pass/Магазином, не дублируется).

Формат PromoCode.rewards — список словарей с ключом 'type' (значение
RewardType) и остальными полями как payload, например:
  [{"type": "money", "amount": 5000}, {"type": "car", "car_id": 12}]"""
from __future__ import annotations

import datetime as dt

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import RewardType
from app.core.exceptions import AppError
from app.database.transaction import atomic, distributed_lock
from app.localization.manager import t
from app.models.promo_code import PromoCode
from app.models.user import User
from app.repositories.promo import PromoCodeRepository, PromoRedemptionRepository
from app.services.rewards import grant_reward


class PromoService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def redeem(self, user: User, code: str) -> PromoCode:
        code = code.strip()

        async with distributed_lock(f"promo:{code.lower()}:{user.id}"):
            async with atomic(self.session):
                promo_repo = PromoCodeRepository(self.session)
                promo = await promo_repo.get_by_code(code)
                if promo is None or not promo.is_active:
                    raise AppError(t("promo_invalid", user.language))

                now = dt.datetime.now(dt.timezone.utc)
                if promo.expires_at is not None and promo.expires_at < now:
                    raise AppError(t("promo_expired", user.language))

                if promo.activation_limit is not None and promo.activations_count >= promo.activation_limit:
                    raise AppError(t("promo_limit_reached", user.language))

                redemption_repo = PromoRedemptionRepository(self.session)
                if await redemption_repo.has_redeemed(promo.id, user.id):
                    raise AppError(t("promo_already_used", user.language))

                await redemption_repo.create(promo.id, user.id)
                await promo_repo.increment_activations(promo.id)

                for reward in promo.rewards:
                    payload = {k: v for k, v in reward.items() if k != "type"}
                    try:
                        reward_type = RewardType(reward.get("type"))
                    except ValueError:
                        continue  # неизвестный/повреждённый тип — пропускаем, не роняем активацию
                    await grant_reward(self.session, user, reward_type, payload, f"promo_{promo.id}")

        return promo
