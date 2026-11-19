from __future__ import annotations

import pytest
from sqlalchemy import select

from app.core.enums import ObtainedFrom, SaleStatus
from app.core.exceptions import AppError
from app.models.garage import Garage
from app.models.garage_upgrade import GarageUpgradeTier
from app.models.sale import Sale
from app.repositories.garage import UserCarRepository
from app.services.economy.transactions import EconomyService
from app.services.garage.service import GarageService
from app.services.garage.upgrades import GarageUpgradeService
from tests.conftest import NOW, balance_of, make_car, make_user

pytestmark = pytest.mark.asyncio


async def _give(session, user, car):
    user_car, _ = await GarageService(session).add_car_to_garage(user, car.id, car.price, ObtainedFrom.ADMIN_GRANT, NOW)
    return user_car


async def test_sell_to_state_regular_gets_60_percent(db_session):
    user = await make_user(db_session, 1)
    car = await make_car(db_session, price=100_000)
    user_car = await _give(db_session, user, car)

    amount = await EconomyService(db_session).sell_to_state(user, user_car.id)

    assert amount == 60_000 and await balance_of(db_session, 1) == 60_000


async def test_sell_to_state_vip_gets_70_percent(db_session):
    user = await make_user(db_session, 1, vip=True)
    car = await make_car(db_session, price=100_000)
    user_car = await _give(db_session, user, car)
    assert await EconomyService(db_session).sell_to_state(user, user_car.id) == 70_000


async def test_car_cannot_be_sold_twice(db_session):
    user = await make_user(db_session, 1)
    car = await make_car(db_session, price=100_000)
    user_car = await _give(db_session, user, car)
    service = EconomyService(db_session)

    await service.sell_to_state(user, user_car.id)
    with pytest.raises(AppError):
        await service.sell_to_state(user, user_car.id)
    assert await balance_of(db_session, 1) == 60_000


async def test_cannot_sell_someone_elses_car(db_session):
    owner = await make_user(db_session, 1)
    thief = await make_user(db_session, 2)
    user_car = await _give(db_session, owner, await make_car(db_session))
    with pytest.raises(AppError):
        await EconomyService(db_session).sell_to_state(thief, user_car.id)
    assert await UserCarRepository(db_session).count_owned(1) == 1


async def test_player_sale_accept_moves_car_and_money_once(db_session):
    seller = await make_user(db_session, 1)
    buyer = await make_user(db_session, 2, balance=200_000)
    user_car = await _give(db_session, seller, await make_car(db_session))
    service = EconomyService(db_session)

    sale, _, _ = await service.offer_sell_to_player(seller, user_car.id, str(buyer.id), 100_000)
    await service.accept_sale_offer(buyer, sale.id)
    with pytest.raises(AppError):                       # повторное нажатие «Купить»
        await service.accept_sale_offer(buyer, sale.id)

    assert await balance_of(db_session, 2) == 100_000
    assert await balance_of(db_session, 1) == 75_000    # −25% комиссии
    assert await UserCarRepository(db_session).count_owned(2) == 1
    assert await UserCarRepository(db_session).count_owned(1) == 0
    stored = (await db_session.execute(select(Sale).where(Sale.id == sale.id))).scalar_one()
    assert stored.status == SaleStatus.ACCEPTED


async def test_player_sale_buyer_without_money_leaves_everything_intact(db_session):
    seller = await make_user(db_session, 1)
    buyer = await make_user(db_session, 2, balance=10)
    user_car = await _give(db_session, seller, await make_car(db_session))
    service = EconomyService(db_session)

    sale, _, _ = await service.offer_sell_to_player(seller, user_car.id, str(buyer.id), 100_000)
    with pytest.raises(AppError):
        await service.accept_sale_offer(buyer, sale.id)

    assert await UserCarRepository(db_session).count_owned(1) == 1
    assert await balance_of(db_session, 1) == 0


async def test_garage_upgrade_charges_price_and_sets_capacity(db_session):
    user = await make_user(db_session, 1, balance=30_000)
    db_session.add(GarageUpgradeTier(new_capacity=20, price=25_000, sort_order=1))
    db_session.add(Garage(user_id=1, capacity=15))
    await db_session.flush()

    new_capacity = await GarageUpgradeService(db_session).upgrade(user)

    assert new_capacity == 20 and await balance_of(db_session, 1) == 5_000


async def test_garage_upgrade_without_money_is_rejected(db_session):
    user = await make_user(db_session, 1, balance=100)
    db_session.add(GarageUpgradeTier(new_capacity=20, price=25_000, sort_order=1))
    db_session.add(Garage(user_id=1, capacity=15))
    await db_session.flush()
    with pytest.raises(AppError):
        await GarageUpgradeService(db_session).upgrade(user)
    assert await balance_of(db_session, 1) == 100
