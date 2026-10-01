"""Логика профиля: сводка для экрана и ежедневный бонус.

Полноценный экономический слой (комиссии, общая идемпотентная
инфраструктура для ставок/покупок/переводов) строится на этапе Economy.
Здесь — сознательно минимальная, но корректная (атомарная, идемпотентная,
под distributed-локом) реализация только ежедневного бонуса, чтобы не
блокировать экран профиля до более позднего этапа."""
from __future__ import annotations

import datetime as dt

from sqlalchemy.ext.asyncio import AsyncSession

from app.utils.dates import current_game_day  # noqa: F401
from app.core.enums import TransactionType
from app.core.exceptions import AppError
from app.database.transaction import atomic, distributed_lock, new_operation_id
from app.localization.manager import t
from app.models.user import User
from app.repositories.garage import UserCarRepository
from app.repositories.settings import SettingsRepository
from app.repositories.transaction import TransactionRepository
from app.repositories.user import UserRepository

DEFAULT_DAILY_BONUS_AMOUNT = 1000


class ProfileService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_cars_count(self, user_id: int) -> int:
        return await UserCarRepository(self.session).count_owned(user_id)

    async def claim_daily_bonus(self, user: User, now: dt.datetime) -> int:
        today = current_game_day(now)
        if user.last_daily_bonus_date == today:
            raise AppError(t("daily_bonus_already", user.language))

        async with distributed_lock(f"daily_bonus:{user.id}"):
            async with atomic(self.session):
                # Перечитываем состояние под локом — другой апдейт мог
                # успеть получить бонус, пока мы его ждали.
                user_repo = UserRepository(self.session)
                fresh = await user_repo.get(user.id)
                if fresh is None:
                    raise AppError(t("error_not_found", user.language))
                if fresh.last_daily_bonus_date == today:
                    raise AppError(t("daily_bonus_already", user.language))

                amount = await SettingsRepository(self.session).get_value(
                    "daily_bonus_amount", DEFAULT_DAILY_BONUS_AMOUNT
                )

                new_balance = await user_repo.increment_balance(user.id, amount)
                await user_repo.set_last_daily_bonus_date(user.id, today)

                await TransactionRepository(self.session).create(
                    user_id=user.id,
                    type_=TransactionType.DAILY_BONUS,
                    amount=amount,
                    balance_after=new_balance,
                    operation_id=new_operation_id(),
                    description="daily_bonus",
                )

        # Раздел 22 ТЗ: ежедневный бонус/контейнер засчитывается как открытый
        # контейнер для прогресса Battle Pass.
        from app.services.battle_pass.progress import BattlePassProgressService

        await BattlePassProgressService(self.session).mark_container_opened(user.id, now)

        user.balance = new_balance
        user.last_daily_bonus_date = today
        return amount
