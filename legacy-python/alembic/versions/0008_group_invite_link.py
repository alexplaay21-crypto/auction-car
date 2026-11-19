"""invite_link для групп"""
from typing import Union

from alembic import op

revision: str = "0008_group_invite_link"
down_revision: Union[str, None] = "0007_game_tweaks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE groups ADD COLUMN IF NOT EXISTS invite_link varchar(255)")


def downgrade() -> None:
    op.execute("ALTER TABLE groups DROP COLUMN IF EXISTS invite_link")
