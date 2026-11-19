from __future__ import annotations

import pytest

from app.core.enums import RewardType
from app.core.exceptions import AppError
from app.models.garage import Garage
from app.repositories.container import UserContainerRepository
from app.repositories.garage import UserCarRepository
from app.services.containers.inventory import ContainerInventoryService
from app.services.rewards import grant_reward
from tests.conftest import balance_of, make_car, make_container, make_user

pytestmark = pytest.mark.asyncio


async def test_container_reward_goes_to_inventory_and_opens_into_garage(db_session):
    car = await make_car(db_session, price=40_000)
    container = await make_container(db_session, [car.id])
    user = await make_user(db_session, 1)

    await grant_reward(db_session, user, RewardType.CONTAINER, {"container_id": container.id, "quantity": 2}, "test")
    assert await UserContainerRepository(db_session).total_for_user(1) == 2

    result = await ContainerInventoryService(db_session).open(user, container.id)

    assert result.car.id == car.id
    assert await UserContainerRepository(db_session).total_for_user(1) == 1
    assert await UserCarRepository(db_session).count_owned(1) == 1


async def test_cannot_open_container_you_do_not_have(db_session):
    car = await make_car(db_session)
    container = await make_container(db_session, [car.id])
    user = await make_user(db_session, 1)
    with pytest.raises(AppError):
        await ContainerInventoryService(db_session).open(user, container.id)


async def test_open_with_full_garage_auto_sells(db_session):
    car = await make_car(db_session, price=50_000)
    container = await make_container(db_session, [car.id])
    user = await make_user(db_session, 1)
    db_session.add(Garage(user_id=1, capacity=0))
    await db_session.flush()
    await ContainerInventoryService(db_session).grant(1, container.id, 1)

    result = await ContainerInventoryService(db_session).open(user, container.id)

    assert result.auto_sold_amount == 45_000
    assert await balance_of(db_session, 1) == 45_000
