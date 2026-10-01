from __future__ import annotations

from app.services.auctions.bidding import DEFAULT_AUCTION_TIMER_SECONDS, DEFAULT_BET_STEP
from app.services.containers.randomizer import weighted_choice


def test_spec_defaults():
    assert DEFAULT_BET_STEP == 500
    assert DEFAULT_AUCTION_TIMER_SECONDS == 30


def test_weighted_choice_ignores_zero_weight():
    for _ in range(200):
        assert weighted_choice([("a", 0), ("b", 5)]) == "b"


def test_weighted_choice_all_zero_does_not_crash():
    assert weighted_choice([("a", 0), ("b", 0)]) in {"a", "b"}


def test_weighted_choice_distribution_roughly_follows_weights():
    hits = sum(weighted_choice([("rare", 1), ("common", 9)]) == "rare" for _ in range(5000))
    assert 300 < hits < 700  # ожидание ~500
