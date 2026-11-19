"""claimed_level, стартовый баланс 15000, триггер потерянного контейнера"""
from typing import Union

from alembic import op

revision: str = "0007_game_tweaks"
down_revision: Union[str, None] = "0006_room_waiters"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE battle_pass_progress ADD COLUMN IF NOT EXISTS claimed_level integer NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE users ALTER COLUMN balance SET DEFAULT 15000")
    op.execute("""
    CREATE OR REPLACE FUNCTION add_car_to_lost_container() RETURNS trigger AS $fn$
    DECLARE cid integer;
    BEGIN
      SELECT id INTO cid FROM containers WHERE name = 'Потерянный контейнер' LIMIT 1;
      IF cid IS NULL THEN RETURN NEW; END IF;
      IF NEW.rarity <> 'mythic' THEN
        INSERT INTO container_cars (container_id, car_id, drop_weight)
        VALUES (cid, NEW.id, 1) ON CONFLICT DO NOTHING;
      ELSE
        DELETE FROM container_cars WHERE container_id = cid AND car_id = NEW.id;
      END IF;
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql
    """)
    op.execute("DROP TRIGGER IF EXISTS trg_lost_container ON cars")
    op.execute("""
    CREATE TRIGGER trg_lost_container AFTER INSERT OR UPDATE OF rarity ON cars
    FOR EACH ROW EXECUTE FUNCTION add_car_to_lost_container()
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_lost_container ON cars")
    op.execute("DROP FUNCTION IF EXISTS add_car_to_lost_container()")
