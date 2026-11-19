from __future__ import annotations

import pytest
from sqlalchemy import func, select

from app.core.enums import RewardType
from app.core.exceptions import AppError
from app.models.purchase import Purchase
from app.models.shop_lot import ShopLot
from app.models.shop_lot_item import ShopLotItem
from app.repositories.garage import UserCarRepository
from app.services.referrals.service import ReferralService
from app.services.shop.purchases import ShopPurchaseService
from tests.conftest import balance_of, make_car, make_user

pytestmark = pytest.mark.asyncio


async def _lot(session, price: int, items: list[tuple[RewardType, dict, int]]) -> ShopLot:
    lot = ShopLot(title="Lot", price=price, is_available=True)
    session.add(lot)
    await session.flush()
    for item_type, payload, quantity in items:
        session.add(ShopLotItem(lot_id=lot.id, item_type=item_type, payload=payload, quantity=quantity))
    await session.flush()
    return lot


async def test_lot_with_several_items_is_granted_once(db_session):
    car = await make_car(db_session)
    user = await make_user(db_session, 1, balance=10_000)
    lot = await _lot(db_session, 4_000, [
        (RewardType.MONEY, {"amount": 1_000}, 1),
        (RewardType.CAR, {"car_id": car.id}, 1),
    ])

    purchase = await ShopPurchaseService(db_session).purchase_lot(user, lot.id)

    assert purchase.id is not None
    assert await balance_of(db_session, 1) == 10_000 - 4_000 + 1_000
    assert await UserCarRepository(db_session).count_owned(1) == 1


async def test_cannot_buy_without_enough_money_and_nothing_is_granted(db_session):
    car = await make_car(db_session)
    user = await make_user(db_session, 1, balance=1_000)
    lot = await _lot(db_session, 4_000, [(RewardType.CAR, {"car_id": car.id}, 1)])

    with pytest.raises(AppError):
        await ShopPurchaseService(db_session).purchase_lot(user, lot.id)

    assert await balance_of(db_session, 1) == 1_000
    assert await UserCarRepository(db_session).count_owned(1) == 0
    assert (await db_session.execute(select(func.count(Purchase.id)))).scalar() == 0


async def test_second_purchase_cannot_overdraw(db_session):
    """Денег хватает на одну покупку — вторая (повторное нажатие) отклоняется."""
    user = await make_user(db_session, 1, balance=5_000)
    lot = await _lot(db_session, 4_000, [(RewardType.MONEY, {"amount": 0}, 1)])
    service = ShopPurchaseService(db_session)

    await service.purchase_lot(user, lot.id)
    with pytest.raises(AppError):
        await service.purchase_lot(user, lot.id)

    assert await balance_of(db_session, 1) == 1_000


async def test_referral_first_purchase_bonus_paid_exactly_once(db_session):
    inviter = await make_user(db_session, 1)
    invited = await make_user(db_session, 2, balance=20_000)
    await ReferralService(db_session).register_referral(inviter.id, invited)
    inviter_after_signup = await balance_of(db_session, 1)

    lot = await _lot(db_session, 1_000, [(RewardType.MONEY, {"amount": 0}, 1)])
    service = ShopPurchaseService(db_session)
    await service.purchase_lot(invited, lot.id)
    await service.purchase_lot(invited, lot.id)

    assert await balance_of(db_session, 1) == inviter_after_signup + 30_000
