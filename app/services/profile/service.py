"""Логика профиля: сводка для экрана и ежедневный бонус (контейнер)."""
from __future__ import annotations
from app.utils.loc import loc

import datetime as dt

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.database.transaction import atomic, distributed_lock
from app.localization.manager import t
from app.models.user import User
from app.repositories.container import ContainerRepository
from app.repositories.garage import UserCarRepository
from app.repositories.settings import SettingsRepository
from app.repositories.user import UserRepository
from app.services.containers.inventory import ContainerInventoryService, OpenResult
from app.utils.dates import current_game_day, time_left_parts

MAX_BALANCE_FOR_DAILY_BONUS = 100_000
DEFAULT_DAILY_BONUS_CONTAINER_ID = 3  # «Потерянный контейнер»


class ProfileService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_cars_count(self, user_id: int) -> int:
        return await UserCarRepository(self.session).count_owned(user_id)

    async def claim_daily_bonus(self, user: User, now: dt.datetime) -> tuple[str, OpenResult]:
        """Выдаёт контейнер и сразу открывает его."""
        today = current_game_day(now)
        if user.last_daily_bonus_date == today:
            raise AppError(t("daily_bonus_already", user.language, **time_left_parts(now)))

        if user.balance > MAX_BALANCE_FOR_DAILY_BONUS:
            raise AppError(t("daily_bonus_rich", user.language, limit=MAX_BALANCE_FOR_DAILY_BONUS))

        async with distributed_lock(f"daily_bonus:{user.id}"):
            async with atomic(self.session):
                user_repo = UserRepository(self.session)
                fresh = await user_repo.get(user.id)
                if fresh is None:
                    raise AppError(t("error_not_found", user.language))
                if fresh.balance > MAX_BALANCE_FOR_DAILY_BONUS:
                    raise AppError(t("daily_bonus_rich", user.language, limit=MAX_BALANCE_FOR_DAILY_BONUS))
                if fresh.last_daily_bonus_date == today:
                    raise AppError(t("daily_bonus_already", user.language, **time_left_parts(now)))

                container_id = await SettingsRepository(self.session).get_value(
                    "daily_bonus_container_id", DEFAULT_DAILY_BONUS_CONTAINER_ID
                )
                container = await ContainerRepository(self.session).get(container_id)
                if container is None:
                    raise AppError(t("error_not_found", user.language))

                await ContainerInventoryService(self.session).grant(user.id, container_id, 1)
                await user_repo.set_last_daily_bonus_date(user.id, today)

        user.last_daily_bonus_date = today

        # Открываем уже после выдачи, в отдельной транзакции.
        result = await ContainerInventoryService(self.session).open(user, container_id)
        return loc(container, "name", user.language), result
