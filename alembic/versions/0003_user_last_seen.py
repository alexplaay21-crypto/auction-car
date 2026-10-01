"""users.last_seen_at — нужен для сегментации рассылок по активности
(active/inactive, раздел 25 ТЗ).

Revision ID: 0003_user_last_seen
Revises: 0002_seed_defaults
Create Date: 2026-09-29

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0003_user_last_seen"
down_revision: Union[str, None] = "0002_seed_defaults"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "last_seen_at")
