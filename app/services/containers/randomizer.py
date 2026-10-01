"""Случайный выбор машины из контейнера: сначала редкость (по весам из
Setting['rarity_chances']), затем конкретная машина внутри этой редкости
(по ContainerCar.drop_weight среди машин этой редкости в данном контейнере).

Никакие фиксированные вероятности (1/800, 1/40 и т.п.) не зашиты в код —
только дефолт на случай, если админ ещё не задал Setting (раздел 10 ТЗ)."""
from __future__ import annotations

import random
from collections import defaultdict
from typing import Sequence, TypeVar

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import Language, Rarity
from app.core.exceptions import AppError
from app.localization.manager import t
from app.models.car import Car
from app.repositories.container import ContainerCarRepository
from app.repositories.settings import SettingsRepository

DEFAULT_RARITY_CHANCES: dict[str, float] = {
    "common": 60,
    "rare": 30,
    "epic": 9,
    "mythic": 1,
}

T = TypeVar("T")


def weighted_choice(items: Sequence[tuple[T, float]]) -> T:
    """Взвешенный случайный выбор. Если сумма весов <= 0 (все веса нулевые
    или не заданы), выбирает равномерно, чтобы не падать с ZeroDivisionError."""
    total = sum(weight for _, weight in items)
    if total <= 0:
        return random.choice([item for item, _ in items])
    roll = random.uniform(0, total)
    upto = 0.0
    for item, weight in items:
        upto += weight
        if roll <= upto:
            return item
    return items[-1][0]


class ContainerRandomizer:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_rarity_chances(self) -> dict[str, float]:
        return await SettingsRepository(self.session).get_value("rarity_chances", DEFAULT_RARITY_CHANCES)

    async def roll_car(self, container_id: int, language: Language) -> Car:
        rows = await ContainerCarRepository(self.session).list_for_container_with_car(container_id)

        by_rarity: dict[Rarity, list[tuple[Car, int]]] = defaultdict(list)
        for link, car in rows:
            if car.is_active:
                by_rarity[car.rarity].append((car, link.drop_weight))

        if not by_rarity:
            raise AppError(t("container_empty", language))

        rarity_chances = await self.get_rarity_chances()
        rarity_options = [
            (rarity, float(rarity_chances.get(rarity.value, 0))) for rarity in by_rarity
        ]
        chosen_rarity = weighted_choice(rarity_options)

        car_options = [(car, float(weight)) for car, weight in by_rarity[chosen_rarity]]
        return weighted_choice(car_options)
