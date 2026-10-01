"""Инварианты БД: схема создаётся, отрицательный баланс невозможен."""
from __future__ import annotations

import pytest
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError

from app.models.user import User
from tests.conftest import make_user

pytestmark = pytest.mark.asyncio


async def test_balance_cannot_go_negative_at_db_level(db_session):
    await make_user(db_session, 1, balance=100)
    await db_session.flush()
    with pytest.raises(IntegrityError):
        await db_session.execute(update(User).where(User.id == 1).values(balance=User.balance - 500))
        await db_session.flush()
