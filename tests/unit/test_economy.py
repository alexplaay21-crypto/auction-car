from __future__ import annotations

from app.services.economy.commissions import DEFAULT_COMMISSIONS


def test_default_commissions_match_spec():
    # Разделы 11, 14, 15, 16 ТЗ.
    assert DEFAULT_COMMISSIONS["commission_quick_sell"] == {"regular": 0.10, "vip": 0.05}
    assert DEFAULT_COMMISSIONS["commission_sell_state"] == {"regular": 0.40, "vip": 0.30}
    assert DEFAULT_COMMISSIONS["commission_sell_player"] == {"regular": 0.25, "vip": 0.15}
    assert DEFAULT_COMMISSIONS["commission_transfer"] == {"regular": 0.10, "vip": 0.0}


def test_state_sale_example_from_spec():
    # «при стоимости $100 000 обычный игрок получает $60 000»
    assert round(100_000 * (1 - DEFAULT_COMMISSIONS["commission_sell_state"]["regular"])) == 60_000
