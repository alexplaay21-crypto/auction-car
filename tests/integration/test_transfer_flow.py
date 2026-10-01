from __future__ import annotations

import pytest
from sqlalchemy import func, select

from app.core.enums import TransactionType
from app.core.exceptions import AppError
from app.models.history import HistoryEvent
from app.models.transfer import Transfer
from app.services.economy.transactions import EconomyService
from tests.conftest import balance_of, make_user

pytestmark = pytest.mark.asyncio


async def test_transfer_regular_player_pays_10_percent(db_session):
    sender = await make_user(db_session, 1, balance=100_000)
    recipient = await make_user(db_session, 2)

    net, _ = await EconomyService(db_session).transfer_money(sender, str(recipient.id), 10_000)

    assert net == 9_000
    assert await balance_of(db_session, 1) == 90_000
    assert await balance_of(db_session, 2) == 9_000
    transfer = (await db_session.execute(select(Transfer))).scalar_one()
    assert transfer.commission_amount == 1_000


async def test_transfer_vip_pays_no_commission(db_session):
    sender = await make_user(db_session, 1, balance=50_000, vip=True)
    recipient = await make_user(db_session, 2)

    net, _ = await EconomyService(db_session).transfer_money(sender, str(recipient.id), 10_000)

    assert net == 10_000
    assert await balance_of(db_session, 2) == 10_000


async def test_transfer_insufficient_funds_changes_nothing(db_session):
    sender = await make_user(db_session, 1, balance=5_000)
    recipient = await make_user(db_session, 2)

    with pytest.raises(AppError):
        await EconomyService(db_session).transfer_money(sender, str(recipient.id), 10_000)

    assert await balance_of(db_session, 1) == 5_000
    assert await balance_of(db_session, 2) == 0
    assert (await db_session.execute(select(func.count(Transfer.id)))).scalar() == 0


async def test_transfer_to_self_rejected(db_session):
    sender = await make_user(db_session, 1, balance=5_000)
    with pytest.raises(AppError):
        await EconomyService(db_session).transfer_money(sender, str(sender.id), 1_000)
    assert await balance_of(db_session, 1) == 5_000


async def test_transfer_is_written_to_history(db_session):
    sender = await make_user(db_session, 1, balance=20_000)
    recipient = await make_user(db_session, 2)
    await EconomyService(db_session).transfer_money(sender, str(recipient.id), 10_000)
    await db_session.flush()

    types = {
        row[0] for row in (await db_session.execute(
            select(HistoryEvent.event_type).where(HistoryEvent.user_id.in_([1, 2]))
        )).all()
    }
    assert f"money_{TransactionType.TRANSFER_OUT.value}" in types
    assert f"money_{TransactionType.TRANSFER_IN.value}" in types
