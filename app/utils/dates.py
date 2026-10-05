"""Игровой день (раздел 18 ТЗ): начинается в 00:00 UTC."""
from __future__ import annotations

import datetime as dt

from app.core.constants import GAME_DAY_RESET_HOUR_UTC


def current_game_day(now: dt.datetime) -> dt.date:
    shifted = now.astimezone(dt.timezone.utc) - dt.timedelta(hours=GAME_DAY_RESET_HOUR_UTC)
    return shifted.date()


def time_left_parts(now: dt.datetime) -> dict[str, int]:
    """Сколько осталось до начала следующего игрового дня."""
    now_utc = now.astimezone(dt.timezone.utc)
    next_start = dt.datetime.combine(
        current_game_day(now) + dt.timedelta(days=1), dt.time(), tzinfo=dt.timezone.utc
    ) + dt.timedelta(hours=GAME_DAY_RESET_HOUR_UTC)
    minutes = max(int((next_start - now_utc).total_seconds() // 60), 0)
    return {"hours": minutes // 60, "minutes": minutes % 60}
