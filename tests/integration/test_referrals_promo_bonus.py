from __future__ import annotations

import datetime as dt

import pytest

from app.core.enums import Rarity
from app.core.exceptions import AppError
from app.models.promo_code import PromoCode
from app.repositories.garage import UserCarRepository
from app.services.profile.service import ProfileService
from app.services.promo.service import PromoService
from app.services.referrals.service import ReferralService
from tests.conftest import balance_of, make_car, make_user

pytestmark = pytest.mark.asyncio


async def test_referral_pays_both_sides_once(db_session):
    inviter = await make_user(db_session, 1)
    invited = await make_user(db_session, 2)
    service = ReferralService(db_session)

    assert await service.register_referral(inviter.id, invited) is True
    assert await service.register_referral(inviter.id, invited) is False   # повтор не засчитывается

    assert await balance_of(db_session, 1) == 10_000
    assert await balance_of(db_session, 2) == 5_000


async def test_cannot_invite_yourself(db_session):
    user = await make_user(db_session, 1)
    assert await ReferralService(db_session).register_referral(1, user) is False
    assert await balance_of(db_session, 1) == 0


async def test_tenth_invite_grants_epic_car(db_session):
    await make_car(db_session, rarity=Rarity.EPIC, name="Epic")
    inviter = await make_user(db_session, 1)
    service = ReferralService(db_session)
    for i in range(2, 12):
        await service.register_referral(1, await make_user(db_session, i))
    assert await UserCarRepository(db_session).count_owned(1) == 1


async def _promo(session, **kwargs) -> PromoCode:
    promo = PromoCode(code="WELCOME", rewards=[{"type": "money", "amount": 5_000}], created_by=1, **kwargs)
    session.add(promo)
    await session.flush()
    return promo


async def test_promo_cannot_be_redeemed_twice_by_same_user(db_session):
    user = await make_user(db_session, 1)
    await _promo(db_session)
    service = PromoService(db_session)

    await service.redeem(user, "WELCOME")
    with pytest.raises(AppError):
        await service.redeem(user, "WELCOME")
    assert await balance_of(db_session, 1) == 5_000


async def test_promo_activation_limit(db_session):
    first, second = await make_user(db_session, 1), await make_user(db_session, 2)
    await _promo(db_session, activation_limit=1)
    service = PromoService(db_session)

    await service.redeem(first, "WELCOME")
    with pytest.raises(AppError):
        await service.redeem(second, "WELCOME")
    assert await balance_of(db_session, 2) == 0


async def test_expired_or_disabled_promo_rejected(db_session):
    user = await make_user(db_session, 1)
    await _promo(db_session, expires_at=dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=1))
    with pytest.raises(AppError):
        await PromoService(db_session).redeem(user, "WELCOME")
    assert await balance_of(db_session, 1) == 0


async def test_daily_bonus_once_per_utc_day(db_session):
    user = await make_user(db_session, 1)
    service = ProfileService(db_session)
    day = dt.datetime(2026, 1, 1, 12, 0, tzinfo=dt.timezone.utc)

    first = await service.claim_daily_bonus(user, day)
    with pytest.raises(AppError):
        await service.claim_daily_bonus(user, day.replace(hour=23, minute=59))
    await service.claim_daily_bonus(user, dt.datetime(2026, 1, 2, 0, 0, tzinfo=dt.timezone.utc))

    assert await balance_of(db_session, 1) == first * 2
