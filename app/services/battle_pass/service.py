"""Battle Pass: покупка и выдача наград уровня (раздел 22 ТЗ). Ежедневный
прогресс уровня — services/battle_pass/progress.py (вызывает
grant_level_rewards отсюда при поднятии уровня)."""
from __future__ import annotations

import datetime as dt

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import TransactionType
from app.core.exceptions import AppError
from app.database.transaction import atomic, distributed_lock, new_operation_id
from app.localization.manager import t
from app.models.battle_pass import BattlePass
from app.models.battle_pass_progress import BattlePassProgress
from app.models.user import User
from app.repositories.battle_pass import (
    BattlePassLevelRepository,
    BattlePassProgressRepository,
    BattlePassRepository,
    BattlePassRewardRepository,
)
from app.repositories.transaction import TransactionRepository
from app.repositories.user import UserRepository
from app.services.rewards import grant_reward


class BattlePassService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_active(self) -> BattlePass | None:
        return await BattlePassRepository(self.session).get_active()

    async def get_progress(self, user_id: int, bp_id: int) -> BattlePassProgress | None:
        return await BattlePassProgressRepository(self.session).find_by_user_and_pass(user_id, bp_id)

    async def purchase(self, user: User) -> int:
        bp = await self.get_active()
        if bp is None:
            raise AppError(t("bp_not_purchased", user.language))

        async with distributed_lock(f"bp_purchase:{user.id}:{bp.id}"):
            async with atomic(self.session):
                progress_repo = BattlePassProgressRepository(self.session)
                progress = await progress_repo.get_or_create(user.id, bp.id)
                if progress.purchased_at is not None:
                    raise AppError(t("bp_already_purchased", user.language))

                user_repo = UserRepository(self.session)
                fresh = await user_repo.get(user.id)
                if fresh is None:
                    raise AppError(t("error_not_found", user.language))
                if fresh.balance < bp.price:
                    raise AppError(t("error_insufficient_funds", user.language))

                now = dt.datetime.now(dt.timezone.utc)
                new_balance = await user_repo.increment_balance(user.id, -bp.price)
                await TransactionRepository(self.session).create(
                    user_id=user.id, type_=TransactionType.BATTLE_PASS_PURCHASE, amount=-bp.price,
                    balance_after=new_balance, operation_id=new_operation_id(),
                    description=f"battle_pass_purchase_{bp.id}",
                )
                await progress_repo.mark_purchased(progress.id, now)

        user.balance = new_balance
        return bp.price

    async def grant_level_rewards(self, user_id: int, bp_id: int, level_number: int) -> None:
        level = await BattlePassLevelRepository(self.session).get_by_number(bp_id, level_number)
        if level is None:
            return
        rewards = await BattlePassRewardRepository(self.session).list_for_level(level.id)
        if not rewards:
            return

        user = await UserRepository(self.session).get(user_id)
        if user is None:
            return

        async with distributed_lock(f"bp_reward:{user_id}:{level.id}"):
            async with atomic(self.session):
                for reward in rewards:
                    await grant_reward(
                        self.session, user, reward.reward_type, reward.payload,
                        f"bp_level_{level_number}_reward_{reward.id}",
                    )
