"""users.balance >= 0 на уровне БД (раздел 30 ТЗ: отрицательный баланс из-за
ошибки недопустим). Сервисы проверяют баланс заранее; CHECK — вторая линия
защиты от гонок и багов. NOT VALID: не падает на старых данных, но действует
для всех новых изменений.

Revision ID: 0004_balance_non_negative
Revises: 0003_user_last_seen
Create Date: 2026-10-01

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "0004_balance_non_negative"
down_revision: Union[str, None] = "0003_user_last_seen"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE users ADD CONSTRAINT ck_users_balance_non_negative "
        "CHECK (balance >= 0) NOT VALID"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS ck_users_balance_non_negative")
