"""Доступ к каталогу машин: Car."""
from __future__ import annotations

from sqlalchemy import select, update

from app.core.enums import Rarity
from app.models.car import Car
from app.repositories.base import BaseRepository


class CarRepository(BaseRepository[Car]):
    model = Car

    async def list_active(self) -> list[Car]:
        stmt = select(Car).where(Car.is_active.is_(True))
        return list((await self.session.execute(stmt)).scalars())

    async def list_all(self, limit: int = 30) -> list[Car]:
        """Все машины, включая скрытые (для админки)."""
        stmt = select(Car).order_by(Car.id.desc()).limit(limit)
        return list((await self.session.execute(stmt)).scalars())

    async def list_by_rarity(self, rarity: Rarity) -> list[Car]:
        stmt = select(Car).where(Car.is_active.is_(True), Car.rarity == rarity)
        return list((await self.session.execute(stmt)).scalars())

    async def create(self, **fields) -> Car:
        car = Car(**fields)
        self.add(car)
        return car

    async def update_fields(self, car_id: int, **fields) -> None:
        if not fields:
            return
        await self.session.execute(update(Car).where(Car.id == car_id).values(**fields))

    async def set_active(self, car_id: int, is_active: bool) -> None:
        await self.session.execute(update(Car).where(Car.id == car_id).values(is_active=is_active))
