"""Логика каталога машин: получение по ID, форматирование карточки для /car."""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import Language, Rarity
from app.core.exceptions import NotFoundError
from app.localization.manager import t
from app.models.car import Car
from app.repositories.car import CarRepository

_RARITY_LABEL_KEYS = {
    Rarity.COMMON: "rarity_common",
    Rarity.RARE: "rarity_rare",
    Rarity.EPIC: "rarity_epic",
    Rarity.MYTHIC: "rarity_mythic",
}


class CarService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_car_or_raise(self, car_id: int, language: Language) -> Car:
        car = await CarRepository(self.session).get(car_id)
        if car is None or not car.is_active:
            raise NotFoundError(t("car_not_found", language))
        return car

    @staticmethod
    def format_card(car: Car, language: Language) -> str:
        rarity_label = t(_RARITY_LABEL_KEYS[car.rarity], language)
        return t(
            "car_card",
            language,
            rarity_label=rarity_label,
            name=car.name,
            car_id=car.id,
            country=car.country or "—",
            max_speed=car.max_speed,
            accel=car.accel_0_100,
            power=car.power,
            handling=car.handling,
            reliability=car.reliability,
            price=car.price,
        )
