"""RU и EN обязаны совпадать по ключам и плейсхолдерам (требование ТЗ:
'перевод на двух языках должен быть одинаковым')."""
from __future__ import annotations

import re

from app.localization.en import TEXTS as EN
from app.localization.ru import TEXTS as RU

_PLACEHOLDER = re.compile(r"{(\w+)}")


def test_same_keys():
    assert set(RU) == set(EN), sorted(set(RU) ^ set(EN))


def test_same_placeholders():
    bad = [k for k in RU if set(_PLACEHOLDER.findall(RU[k])) != set(_PLACEHOLDER.findall(EN[k]))]
    assert not bad, bad


def test_no_empty_texts():
    assert not [k for k, v in {**RU}.items() if not v.strip()]
    assert not [k for k, v in {**EN}.items() if not v.strip()]


def test_history_labels_cover_all_money_types():
    from app.core.enums import TransactionType

    missing = [tx.value for tx in TransactionType if f"hist_money_{tx.value}" not in RU]
    assert not missing, missing
