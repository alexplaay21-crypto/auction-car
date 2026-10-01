"""Инвентарь контейнеров игрока (награды контейнером из магазина/BP/промокодов/админки).

Revision ID: 0005_user_containers
Revises: 0004_balance_non_negative
Create Date: 2026-10-01

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005_user_containers"
down_revision: Union[str, None] = "0004_balance_non_negative"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_containers",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("container_id", sa.Integer(), sa.ForeignKey("containers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "container_id", name="uq_user_containers_user_container"),
        sa.CheckConstraint("quantity >= 0", name="ck_user_containers_quantity_non_negative"),
    )
    op.create_index("ix_user_containers_user_id", "user_containers", ["user_id"])
    op.create_index("ix_user_containers_container_id", "user_containers", ["container_id"])


def downgrade() -> None:
    op.drop_index("ix_user_containers_container_id", table_name="user_containers")
    op.drop_index("ix_user_containers_user_id", table_name="user_containers")
    op.drop_table("user_containers")
