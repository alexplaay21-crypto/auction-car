"""Игровой день (раздел 18 ТЗ): начинается в 00:00 UTC."""
from __future__ import annotations

import datetime as dt

from app.core.constants import GAME_DAY_RESET_HOUR_UTC


def current_game_day(now: dt.datetime) -> dt.date:
    shifted = now.astimezone(dt.timezone.utc) - dt.timedelta(hours=GAME_DAY_RESET_HOUR_UTC)
    return shifted.date()
