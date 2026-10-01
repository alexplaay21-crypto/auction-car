"""Доступ к гаражу: Garage (вместимость), UserCar (владение), GarageUpgradeTier."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import func, select, update

from app.core.enums import ObtainedFrom
from app.models.garage import Garage, UserCar
from app.models.garage_upgrade import GarageUpgradeTier
from app.repositories.base import BaseRepository
from app.repositories.history import record_event


class GarageRepository(BaseRepository[Garage]):
    model = Garage

    async def get_or_create(self, user_id: int, default_capacity: int) -> Garage:
        garage = await self.get(user_id)
        if garage is None:
            garage = Garage(user_id=user_id, capacity=default_capacity)
            self.add(garage)
            await self.flush()
        return garage

    async def set_capacity(self, user_id: int, capacity: int) -> None:
        await self.session.execute(update(Garage).where(Garage.user_id == user_id).values(capacity=capacity))


class UserCarRepository(BaseRepository[UserCar]):
    model = UserCar

    async def add_car(
        self, user_id: int, car_id: int, obtained_from: ObtainedFrom, when: dt.datetime,
        sell_prompt_expires_at: dt.datetime | None = None,
    ) -> UserCar:
        user_car = UserCar(
            user_id=user_id, car_id=car_id, obtained_from=obtained_from,
            obtained_at=when, sell_prompt_expires_at=sell_prompt_expires_at,
        )
        self.add(user_car)
        await self.flush()
        record_event(
            self.session, user_id, "car_obtained",
            {"user_car_id": user_car.id, "car_id": car_id, "source": obtained_from.value},
        )
        return user_car

    async def list_owned(self, user_id: int) -> list[UserCar]:
        stmt = select(UserCar).where(UserCar.user_id == user_id, UserCar.is_sold.is_(False))
        return list((await self.session.execute(stmt)).scalars())

    async def list_owned_page(self, user_id: int, limit: int, offset: int) -> list[UserCar]:
        stmt = (
            select(UserCar)
            .where(UserCar.user_id == user_id, UserCar.is_sold.is_(False))
            .order_by(UserCar.id.desc())
            .limit(limit)
            .offset(offset)
        )
        return list((await self.session.execute(stmt)).scalars())

    async def list_owned_page_with_car(self, user_id: int, limit: int, offset: int):
        """То же, что list_owned_page, но сразу с данными машины из каталога
        (имя, редкость) — одним запросом, без N+1."""
        from app.models.car import Car

        stmt = (
            select(UserCar, Car)
            .join(Car, Car.id == UserCar.car_id)
            .where(UserCar.user_id == user_id, UserCar.is_sold.is_(False))
            .order_by(UserCar.id.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.session.execute(stmt)
        return [(uc, car) for uc, car in result.all()]


    async def count_owned(self, user_id: int) -> int:
        stmt = select(func.count()).select_from(UserCar).where(
            UserCar.user_id == user_id, UserCar.is_sold.is_(False)
        )
        return (await self.session.execute(stmt)).scalar_one()

    async def revoke(self, user_car_id: int, when: dt.datetime) -> None:
        """Изъятие админом: машина выбывает из гаража без продажи (sold_price
        остаётся NULL — в статистике продаж и комиссий не учитывается)."""
        await self.session.execute(
            update(UserCar).where(UserCar.id == user_car_id).values(is_sold=True, sold_at=when, sold_price=None)
        )

    async def mark_sold(self, user_car_id: int, price: int, when: dt.datetime) -> None:
        owner_id = (
            await self.session.execute(select(UserCar.user_id).where(UserCar.id == user_car_id))
        ).scalar_one_or_none()
        record_event(self.session, owner_id, "car_sold", {"user_car_id": user_car_id, "price": price})
        await self.session.execute(
            update(UserCar)
            .where(UserCar.id == user_car_id)
            .values(is_sold=True, sold_at=when, sold_price=price)
        )

    async def transfer_owner(self, user_car_id: int, new_owner_id: int) -> None:
        old_owner_id = (
            await self.session.execute(select(UserCar.user_id).where(UserCar.id == user_car_id))
        ).scalar_one_or_none()
        payload = {"user_car_id": user_car_id, "from": old_owner_id, "to": new_owner_id}
        record_event(self.session, old_owner_id, "car_given", payload)
        record_event(self.session, new_owner_id, "car_received", payload)
        await self.session.execute(
            update(UserCar).where(UserCar.id == user_car_id).values(user_id=new_owner_id)
        )


class GarageUpgradeTierRepository(BaseRepository[GarageUpgradeTier]):
    model = GarageUpgradeTier

    async def list_ordered(self) -> list[GarageUpgradeTier]:
        stmt = select(GarageUpgradeTier).order_by(GarageUpgradeTier.sort_order, GarageUpgradeTier.new_capacity)
        return list((await self.session.execute(stmt)).scalars())

    async def get_next_tier(self, current_capacity: int) -> GarageUpgradeTier | None:
        stmt = (
            select(GarageUpgradeTier)
            .where(GarageUpgradeTier.new_capacity > current_capacity)
            .order_by(GarageUpgradeTier.new_capacity)
            .limit(1)
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def upsert(self, new_capacity: int, price: int) -> GarageUpgradeTier:
        stmt = select(GarageUpgradeTier).where(GarageUpgradeTier.new_capacity == new_capacity)
        tier = (await self.session.execute(stmt)).scalar_one_or_none()
        if tier is None:
            tier = GarageUpgradeTier(new_capacity=new_capacity, price=price, sort_order=new_capacity)
            self.add(tier)
        else:
            tier.price = price
        return tier

    async def delete_by_capacity(self, new_capacity: int) -> bool:
        stmt = select(GarageUpgradeTier).where(GarageUpgradeTier.new_capacity == new_capacity)
        tier = (await self.session.execute(stmt)).scalar_one_or_none()
        if tier is None:
            return False
        await self.delete(tier)
        return True
