"""Доступ к контейнерам и составу выпадающих машин: Container, ContainerCar."""
from __future__ import annotations

from sqlalchemy import select, update

from app.models.container import Container
from app.models.container_car import ContainerCar
from app.repositories.base import BaseRepository


class ContainerRepository(BaseRepository[Container]):
    model = Container

    async def list_enabled(self) -> list[Container]:
        stmt = select(Container).where(Container.is_enabled.is_(True))
        return list((await self.session.execute(stmt)).scalars())

    async def list_all(self, limit: int = 30) -> list[Container]:
        """Все контейнеры, включая выключенные (для админки)."""
        stmt = select(Container).order_by(Container.id.desc()).limit(limit)
        return list((await self.session.execute(stmt)).scalars())

    async def create(self, **fields) -> Container:
        container = Container(**fields)
        self.add(container)
        return container

    async def update_fields(self, container_id: int, **fields) -> None:
        if not fields:
            return
        await self.session.execute(update(Container).where(Container.id == container_id).values(**fields))

    async def set_enabled(self, container_id: int, enabled: bool) -> None:
        await self.session.execute(
            update(Container).where(Container.id == container_id).values(is_enabled=enabled)
        )


class ContainerCarRepository(BaseRepository[ContainerCar]):
    model = ContainerCar

    async def list_for_container(self, container_id: int) -> list[ContainerCar]:
        stmt = select(ContainerCar).where(ContainerCar.container_id == container_id)
        return list((await self.session.execute(stmt)).scalars())

    async def add_car(self, container_id: int, car_id: int, drop_weight: int = 1) -> ContainerCar:
        link = ContainerCar(container_id=container_id, car_id=car_id, drop_weight=drop_weight)
        self.add(link)
        return link

    async def remove_car(self, container_id: int, car_id: int) -> None:
        stmt = select(ContainerCar).where(
            ContainerCar.container_id == container_id, ContainerCar.car_id == car_id
        )
        link = (await self.session.execute(stmt)).scalar_one_or_none()
        if link is not None:
            await self.delete(link)

    async def set_weight(self, container_id: int, car_id: int, drop_weight: int) -> None:
        await self.session.execute(
            update(ContainerCar)
            .where(ContainerCar.container_id == container_id, ContainerCar.car_id == car_id)
            .values(drop_weight=drop_weight)
        )

    async def list_for_container_with_car(self, container_id: int):
        """Состав контейнера сразу с данными машины (редкость, is_active) —
        используется рандомайзером (services/containers/randomizer.py),
        без N+1."""
        from app.models.car import Car

        stmt = (
            select(ContainerCar, Car)
            .join(Car, Car.id == ContainerCar.car_id)
            .where(ContainerCar.container_id == container_id)
        )
        result = await self.session.execute(stmt)
        return [(link, car) for link, car in result.all()]


class UserContainerRepository:
    """Инвентарь контейнеров игрока. Списание — один условный UPDATE:
    при гонке/двойном нажатии второй вызов получит False, а не минус."""

    def __init__(self, session) -> None:
        self.session = session

    async def add(self, user_id: int, container_id: int, quantity: int) -> None:
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        from app.models.user_container import UserContainer

        stmt = pg_insert(UserContainer).values(
            user_id=user_id, container_id=container_id, quantity=quantity
        )
        stmt = stmt.on_conflict_do_update(
            constraint="uq_user_containers_user_container",
            set_={"quantity": UserContainer.quantity + quantity},
        )
        await self.session.execute(stmt)

    async def consume(self, user_id: int, container_id: int, quantity: int = 1) -> bool:
        from app.models.user_container import UserContainer

        stmt = (
            update(UserContainer)
            .where(
                UserContainer.user_id == user_id,
                UserContainer.container_id == container_id,
                UserContainer.quantity >= quantity,
            )
            .values(quantity=UserContainer.quantity - quantity)
        )
        return (await self.session.execute(stmt)).rowcount == 1

    async def list_for_user(self, user_id: int) -> list[tuple["UserContainer", Container]]:
        from app.models.user_container import UserContainer

        stmt = (
            select(UserContainer, Container)
            .join(Container, Container.id == UserContainer.container_id)
            .where(UserContainer.user_id == user_id, UserContainer.quantity > 0)
            .order_by(Container.id)
        )
        return [(uc, c) for uc, c in (await self.session.execute(stmt)).all()]

    async def total_for_user(self, user_id: int) -> int:
        from sqlalchemy import func

        from app.models.user_container import UserContainer

        stmt = select(func.coalesce(func.sum(UserContainer.quantity), 0)).where(
            UserContainer.user_id == user_id
        )
        return int((await self.session.execute(stmt)).scalar() or 0)
