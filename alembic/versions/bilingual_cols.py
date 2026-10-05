"""bilingual columns"""
from alembic import op

revision = "bilingual_cols"
down_revision = "c0ntainer_chances"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE cars ADD COLUMN IF NOT EXISTS name_en VARCHAR(255)")
    op.execute("ALTER TABLE cars ADD COLUMN IF NOT EXISTS country_en VARCHAR(100)")
    op.execute("ALTER TABLE containers ADD COLUMN IF NOT EXISTS name_en VARCHAR(255)")
    op.execute("ALTER TABLE containers ADD COLUMN IF NOT EXISTS country_en VARCHAR(100)")
    op.execute("ALTER TABLE containers ADD COLUMN IF NOT EXISTS description_en TEXT")
    op.execute("ALTER TABLE skills ADD COLUMN IF NOT EXISTS name_en VARCHAR(255)")
    op.execute("ALTER TABLE skills ADD COLUMN IF NOT EXISTS description_en TEXT")


def downgrade() -> None:
    pass
