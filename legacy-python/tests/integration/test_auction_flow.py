from __future__ import annotations

import datetime as dt

import pytest
from sqlalchemy import func, select

from app.core.enums import AuctionStatus, RoomScope
from app.core.exceptions import AppError
from app.models.auction import Auction
from app.models.room import Room
from app.repositories.garage import UserCarRepository
from app.services.auctions.bidding import BiddingService
from app.services.auctions.service import AuctionService
from app.services.rooms.membership import RoomMembershipService
from tests.conftest import balance_of, ledger_sum, make_car, make_container, make_user

pytestmark = pytest.mark.asyncio


async def _start(session, users):
    car = await make_car(session, price=50_000)
    await make_container(session, [car.id], price=10_000)
    room = None
    for user in users:
        room = await RoomMembershipService(session).join_current_room(user, RoomScope.PRIVATE, 0)
    auction = await AuctionService(session).start_next_container(room, users[0].language)
    return room, auction, car


async def _expire(session, auction):
    auction.ends_at = dt.datetime.now(dt.timezone.utc) - dt.timedelta(seconds=1)
    session.add(auction)
    await session.flush()


async def test_first_bid_must_be_step_above_initial(db_session):
    user = await make_user(db_session, 1, balance=100_000)
    room, auction, _ = await _start(db_session, [user])

    with pytest.raises(AppError):
        await BiddingService(db_session).place_bid(user, room.id, 10_400)  # < 10_000 + 500
    assert await balance_of(db_session, 1) == 100_000

    await BiddingService(db_session).place_bid(user, room.id, 10_500)
    assert await balance_of(db_session, 1) == 89_500


async def test_outbid_refunds_previous_leader(db_session):
    a = await make_user(db_session, 1, balance=100_000)
    b = await make_user(db_session, 2, balance=100_000)
    room, auction, _ = await _start(db_session, [a, b])
    bidding = BiddingService(db_session)

    await bidding.place_bid(a, room.id, 10_500)
    await bidding.place_bid(b, room.id, 11_000)

    assert await balance_of(db_session, 1) == 100_000   # деньги вернулись
    assert await balance_of(db_session, 2) == 89_000
    assert await ledger_sum(db_session, 1) == 0
    assert await ledger_sum(db_session, 2) == -11_000


async def test_cannot_bid_more_than_balance(db_session):
    user = await make_user(db_session, 1, balance=5_000)
    room, _, _ = await _start(db_session, [user])
    with pytest.raises(AppError):
        await BiddingService(db_session).place_bid(user, room.id, 10_500)
    assert await balance_of(db_session, 1) == 5_000


async def test_non_member_cannot_bid(db_session):
    member = await make_user(db_session, 1, balance=100_000)
    outsider = await make_user(db_session, 2, balance=100_000)
    room, _, _ = await _start(db_session, [member])
    with pytest.raises(AppError):
        await BiddingService(db_session).place_bid(outsider, room.id, 10_500)
    assert await balance_of(db_session, 2) == 100_000


async def test_winner_gets_car_and_pays_only_last_bid(db_session):
    user = await make_user(db_session, 1, balance=100_000)
    room, auction, car = await _start(db_session, [user])
    await BiddingService(db_session).place_bid(user, room.id, 12_000)
    await _expire(db_session, auction)

    result = await AuctionService(db_session).finalize_auction(auction)

    assert result.winner_user_id == 1 and result.car.id == car.id
    assert await UserCarRepository(db_session).count_owned(1) == 1
    assert await balance_of(db_session, 1) == 88_000          # списано ровно один раз
    ended = (await db_session.execute(select(Auction).where(Auction.id == auction.id))).scalar_one()
    assert ended.status == AuctionStatus.ENDED_WON
    assert result.next_auction is not None                    # комната продолжает работу


async def test_no_bids_means_no_winner_and_no_car(db_session):
    user = await make_user(db_session, 1, balance=100_000)
    room, auction, _ = await _start(db_session, [user])
    await _expire(db_session, auction)

    result = await AuctionService(db_session).finalize_auction(auction)

    assert result.winner_user_id is None and result.car is None
    assert await UserCarRepository(db_session).count_owned(1) == 0
    assert await balance_of(db_session, 1) == 100_000


async def test_stop_requested_ends_room_after_current_container(db_session):
    user = await make_user(db_session, 1, balance=100_000)
    room, auction, _ = await _start(db_session, [user])
    await BiddingService(db_session).place_bid(user, room.id, 10_500)
    room.stop_requested = True
    db_session.add(room)
    await db_session.flush()
    await _expire(db_session, auction)

    result = await AuctionService(db_session).finalize_auction(auction)

    assert result.winner_user_id == 1       # текущий контейнер доигран
    assert result.next_auction is None      # нового нет
    assert result.room_closed is True


async def test_player_without_bids_is_kicked_after_three_containers(db_session):
    active = await make_user(db_session, 1, balance=10_000_000)
    idle = await make_user(db_session, 2, balance=100_000)
    room, auction, _ = await _start(db_session, [active, idle])

    kicked: list[int] = []
    for round_no in range(3):
        await BiddingService(db_session).place_bid(active, room.id, 10_500 + round_no * 1_000)
        await _expire(db_session, auction)
        result = await AuctionService(db_session).finalize_auction(auction)
        kicked += result.kicked_user_ids
        auction = result.next_auction

    assert kicked == [2]


async def test_thirty_first_player_gets_a_new_room(db_session):
    users = [await make_user(db_session, i, balance=1_000) for i in range(1, 32)]
    car = await make_car(db_session)
    await make_container(db_session, [car.id])

    rooms = [await RoomMembershipService(db_session).join_current_room(u, RoomScope.PRIVATE, 0) for u in users]

    assert {r.id for r in rooms[:30]} == {rooms[0].id}
    assert rooms[30].id != rooms[0].id
    assert (await db_session.execute(select(func.count(Room.id)))).scalar() == 2


async def test_full_garage_auto_sells_won_car(db_session):
    from app.models.garage import Garage

    user = await make_user(db_session, 1, balance=100_000)
    room, auction, _ = await _start(db_session, [user])
    db_session.add(Garage(user_id=1, capacity=0))   # гараж «полон» (0 мест)
    await db_session.flush()
    await BiddingService(db_session).place_bid(user, room.id, 10_500)
    await _expire(db_session, auction)

    result = await AuctionService(db_session).finalize_auction(auction)

    assert result.user_car_id is None
    assert result.auto_sold_amount == 45_000                 # 50 000 − 10% (быстрый выкуп)
    assert await balance_of(db_session, 1) == 100_000 - 10_500 + 45_000
