"""seed defaults: тарифы расширения гаража (таблица из ТЗ) и стартовые
значения настраиваемых параметров (таблица settings). Всё это потом
редактируется в админке — здесь только начальные значения, не хардкод
логики: код читает их из БД и имеет собственные fallback-значения на
случай, если строки удалены.

Revision ID: 0002_seed_defaults
Revises: 0001_initial
Create Date: 2026-09-28

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0002_seed_defaults"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Раздел 12 ТЗ: (новая вместимость, цена).
GARAGE_TIERS = [
    (20, 25_000),
    (25, 50_000),
    (30, 100_000),
    (35, 150_000),
    (40, 300_000),
    (45, 400_000),
    (50, 500_000),
]

# Числа шансов редкости в ТЗ намеренно не заданы ("полностью задаются через
# админ-панель") — это лишь стартовые веса, админ меняет их без деплоя.
SETTINGS = {
    "bet_step_default": 500,
    "auction_timer_seconds": 30,
    "next_container_delay_seconds": 5,
    "kick_after_inactive_containers": 3,
    "sell_button_timeout_minutes": 15,
    "rarity_chances": {"common": 60, "rare": 30, "epic": 9, "mythic": 1},
    "daily_bonus_amount": 1000,
    "commission_quick_sell": {"regular": 0.10, "vip": 0.05},
    "commission_sell_state": {"regular": 0.40, "vip": 0.30},
    "commission_sell_player": {"regular": 0.25, "vip": 0.15},
    "commission_transfer": {"regular": 0.10, "vip": 0.0},
    "vip_price": 500_000,
    "garage_max_capacity_no_vip": 50,
    "garage_vip_bonus_slots": 10,
    "referral_inviter_bonus": 10_000,
    "referral_invited_bonus": 5_000,
    "referral_first_purchase_bonus": 30_000,
    "referral_epic_threshold": 10,
}


def upgrade() -> None:
    tiers = sa.table(
        "garage_upgrade_tiers",
        sa.column("new_capacity", sa.Integer),
        sa.column("price", sa.BigInteger),
        sa.column("sort_order", sa.Integer),
    )
    op.bulk_insert(
        tiers,
        [{"new_capacity": cap, "price": price, "sort_order": cap} for cap, price in GARAGE_TIERS],
    )

    settings = sa.table("settings", sa.column("key", sa.String), sa.column("value", sa.JSON))
    op.bulk_insert(settings, [{"key": k, "value": v} for k, v in SETTINGS.items()])


def downgrade() -> None:
    op.execute(
        sa.text("DELETE FROM garage_upgrade_tiers WHERE new_capacity = ANY(:caps)").bindparams(
            sa.bindparam("caps", [cap for cap, _ in GARAGE_TIERS], type_=sa.ARRAY(sa.Integer))
        )
    )
    op.execute(
        sa.text("DELETE FROM settings WHERE key = ANY(:keys)").bindparams(
            sa.bindparam("keys", list(SETTINGS), type_=sa.ARRAY(sa.String))
        )
    )
