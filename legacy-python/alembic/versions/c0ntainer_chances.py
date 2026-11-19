"""container rarity_chances"""
import sqlalchemy as sa
from alembic import op

revision = "c0ntainer_chances"
down_revision = "0008_group_invite_link"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("containers", sa.Column("rarity_chances", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("containers", "rarity_chances")
