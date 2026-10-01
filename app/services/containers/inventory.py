"""Инвентарь контейнеров игрока: выдача (награды магазина/BP/промокодов/
админа) и открытие без аукциона. Открытие = как выигрыш контейнера:
случайная машина из его состава, статистика, прогресс BP; при полном гараже
машина продаётся автоматически. Всё в одной транзакции: если выпадение
не удалось, контейнер не списывается."""
from __future__ import annotations

import dataclasses
import datetime as dt

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import ObtainedFrom
from app.core.exceptions import AppError
from app.database.transaction import atomic, distributed_lock
from app.localization.manager import t
from app.models.car import Car
from app.models.user import User
from app.repositories.container import ContainerRepository, UserContainerRepository
from app.repositories.history import record_event
from app.repositories.user import UserStatsRepository
from app.services.containers.randomizer import ContainerRandomizer


@dataclasses.dataclass(slots=True)
class OpenResult:
    car: Car
    user_car_id: int | None
    auto_sold_amount: int | None


class ContainerInventoryService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def grant(self, user_id: int, container_id: int, quantity: int = 1) -> None:
        """Без собственной транзакции — вызывается внутри награды/админ-действия."""
        if quantity <= 0:
            return
        if await ContainerRepository(self.session).get(container_id) is None:
            return
        await UserContainerRepository(self.session).add(user_id, container_id, quantity)
        record_event(self.session, user_id, "container_received", {"container_id": container_id, "quantity": quantity})

    async def revoke(self, user_id: int, container_id: int, quantity: int = 1) -> bool:
        ok = await UserContainerRepository(self.session).consume(user_id, container_id, quantity)
        if ok:
            record_event(self.session, user_id, "container_removed", {"container_id": container_id, "quantity": quantity})
        return ok

    async def open(self, user: User, container_id: int) -> OpenResult:
        from app.services.battle_pass.progress import BattlePassProgressService
        from app.services.garage.service import GarageService

        async with distributed_lock(f"user_container:{user.id}:{container_id}"):
            async with atomic(self.session):
                if not await UserContainerRepository(self.session).consume(user.id, container_id, 1):
                    raise AppError(t("container_inv_none", user.language))

                car = await ContainerRandomizer(self.session).roll_car(container_id, user.language)
                now = dt.datetime.now(dt.timezone.utc)
                user_car, auto_sold = await GarageService(self.session).add_car_to_garage(
                    user, car.id, car.price, ObtainedFrom.CONTAINER, now
                )
                value = auto_sold if auto_sold is not None else car.price
                await UserStatsRepository(self.session).increment(
                    user.id, containers_opened=1, cars_obtained=1, container_profit=value,
                    **({"earned_total": auto_sold} if auto_sold is not None else {}),
                )
                await BattlePassProgressService(self.session).mark_container_opened(user.id, now)
                record_event(
                    self.session, user.id, "container_opened",
                    {"container_id": container_id, "car_id": car.id},
                )
                return OpenResult(car=car, user_car_id=user_car.id if user_car else None, auto_sold_amount=auto_sold)
