"""Универсальная выдача наград. Разделы 22-24 ТЗ (Battle Pass, Магазин,
Промокоды) используют один и тот же набор типов предметов: деньги, машина,
контейнер, навык, VIP, другое — поэтому логика применения одна и
переиспользуется всеми тремя, а не дублируется.

Формат payload по типу:
  MONEY:     {"amount": 5000}
  CAR:       {"car_id": 12}          -> зачисляется в гараж (с учётом переполнения)
  SKILL:     {"skill_id": 1, "level": 1}
  VIP:       {}                        (VIP не имеет параметров — постоянный статус)
  CONTAINER: {"container_id": 3, "quantity": 1} -> в инвентарь контейнеров игрока
                                         (открывается из гаража без аукциона)
  OTHER:     произвольный payload, не обрабатывается автоматически

Не оборачивает вызов в atomic()/lock — награды часто выдаются пачкой
(несколько предметов одного уровня BP/лота), вызывающий код сам решает
границы транзакции и распределённой блокировки."""
from __future__ import annotations

import datetime as dt

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import ObtainedFrom, RewardType, TransactionType, VipSource
from app.database.transaction import new_operation_id
from app.models.user import User
from app.repositories.car import CarRepository
from app.repositories.transaction import TransactionRepository
from app.repositories.user import UserRepository


async def grant_reward(
    session: AsyncSession, user: User, reward_type: RewardType, payload: dict, source_description: str,
) -> None:
    if reward_type is RewardType.MONEY:
        amount = int(payload.get("amount", 0))
        if amount == 0:
            return
        user_repo = UserRepository(session)
        new_balance = await user_repo.increment_balance(user.id, amount)
        await TransactionRepository(session).create(
            user_id=user.id, type_=TransactionType.BATTLE_PASS_REWARD, amount=amount,
            balance_after=new_balance, operation_id=new_operation_id(), description=source_description,
        )
        user.balance = new_balance

    elif reward_type is RewardType.CAR:
        car_id = payload.get("car_id")
        if car_id is None:
            return
        car = await CarRepository(session).get(int(car_id))
        if car is None:
            return

        from app.services.garage.service import GarageService  # локальный импорт — без цикла модулей

        await GarageService(session).add_car_to_garage(
            user, car.id, car.price, ObtainedFrom.BATTLE_PASS, dt.datetime.now(dt.timezone.utc),
        )

    elif reward_type is RewardType.VIP:
        if not user.is_vip:
            from app.services.vip.service import VipService

            await VipService(session).grant(user.id, VipSource.BATTLE_PASS)
            user.is_vip = True

    elif reward_type is RewardType.SKILL:
        skill_id = payload.get("skill_id")
        if skill_id is not None:
            level = int(payload.get("level", 1))
            from app.repositories.skill import UserSkillRepository

            await UserSkillRepository(session).upsert_level(user.id, int(skill_id), level)

    elif reward_type is RewardType.CONTAINER:
        container_id = payload.get("container_id")
        if container_id is None:
            return
        from app.services.containers.inventory import ContainerInventoryService

        await ContainerInventoryService(session).grant(
            user.id, int(container_id), int(payload.get("quantity", 1))
        )

    else:
        # OTHER / BATTLE_PASS-as-reward — специфично для места использования.
        return
