"""Очередь игроков на вход в комнату после окончания активного аукциона.

Revision ID: 0006_room_waiters
Revises: 0005_user_containers
Create Date: 2026-10-03
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006_room_waiters"
down_revision: Union[str, None] = "0005_user_containers"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.create_table(
        "room_waiters",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("scope", sa.String(), nullable=False),
        sa.Column("scope_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "joined_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "scope",
            "scope_id",
            "user_id",
            name="uq_room_waiters_scope_user",
        ),
    )

    op.create_index(
        "ix_room_waiters_scope",
        "room_waiters",
        ["scope"],
    )
    op.create_index(
        "ix_room_waiters_scope_id",
        "room_waiters",
        ["scope_id"],
    )
    op.create_index(
        "ix_room_waiters_user_id",
        "room_waiters",
        ["user_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_room_waiters_user_id", table_name="room_waiters")
    op.drop_index("ix_room_waiters_scope_id", table_name="room_waiters")
    op.drop_index("ix_room_waiters_scope", table_name="room_waiters")
    op.drop_table("room_waiters")
