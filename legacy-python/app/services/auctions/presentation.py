"""Форматирование сообщений аукциона — переиспользуется и хендлерами
(container.py, bet.py), и фоновой задачей (tasks/auction_tasks.py), чтобы
карточка контейнера везде выглядела одинаково."""
from __future__ import annotations

import datetime as dt

from app.core.enums import Language
from app.localization.manager import t
from app.models.auction import Auction
from app.models.container import Container
from app.models.user import User
from app.utils.usernames import format_mention


def render_container_card(
    auction: Auction, container: Container, leader: User | None, language: Language
) -> str:
    now = dt.datetime.now(dt.timezone.utc)
    seconds_left = max(0, int((auction.ends_at - now).total_seconds()))
    leader_text = format_mention(leader) if leader is not None else t("container_no_leader", language)
    return t(
        "container_card", language,
        country=container.country or "—",
        initial_bid=auction.initial_bid,
        last_bid=auction.current_bid,
        seconds_left=seconds_left,
        leader=leader_text,
    )
