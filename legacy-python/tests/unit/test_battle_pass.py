from __future__ import annotations

import datetime as dt

from app.utils.dates import current_game_day


def test_game_day_changes_at_midnight_utc():
    before = dt.datetime(2026, 1, 1, 23, 59, 59, tzinfo=dt.timezone.utc)
    after = dt.datetime(2026, 1, 2, 0, 0, 0, tzinfo=dt.timezone.utc)
    assert current_game_day(before) == dt.date(2026, 1, 1)
    assert current_game_day(after) == dt.date(2026, 1, 2)


def test_game_day_uses_utc_not_local_zone():
    msk = dt.timezone(dt.timedelta(hours=3))
    moment = dt.datetime(2026, 1, 2, 2, 0, tzinfo=msk)  # = 23:00 UTC предыдущего дня
    assert current_game_day(moment) == dt.date(2026, 1, 1)
