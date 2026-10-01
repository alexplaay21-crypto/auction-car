"""initial schema: full game data model (users, groups, rooms, auctions,
cars, garage, economy, vip, referrals, battle pass, shop, promo, skills,
history, broadcasts, documentation, settings, operations)

Revision ID: 0001_initial
Revises:
Create Date: 2026-09-25

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# --- Общие enum-типы Postgres (создаются один раз, переиспользуются колонками) ---
LANGUAGE_ENUM = postgresql.ENUM("ru", "en", name="language")
RARITY_ENUM = postgresql.ENUM("common", "rare", "epic", "mythic", name="rarity")
ROOM_SCOPE_ENUM = postgresql.ENUM("group", "private", name="room_scope")
ROOM_STATUS_ENUM = postgresql.ENUM("open", "full", "closed", name="room_status")
AUCTION_STATUS_ENUM = postgresql.ENUM(
    "active", "ended_won", "ended_no_bids", "cancelled", name="auction_status"
)
OBTAINED_FROM_ENUM = postgresql.ENUM(
    "container", "shop", "admin_grant", "transfer", "promo", "battle_pass",
    name="obtained_from",
)
SALE_STATUS_ENUM = postgresql.ENUM("pending", "accepted", "declined", "expired", name="sale_status")
TRANSACTION_TYPE_ENUM = postgresql.ENUM(
    "bet", "bet_refund", "container_win_cost", "sell_state", "sell_player_income",
    "buy_player_car", "quick_sell", "transfer_out", "transfer_in", "daily_bonus",
    "referral_bonus", "shop_purchase", "promo_reward", "battle_pass_purchase",
    "battle_pass_reward", "vip_purchase", "garage_upgrade", "admin_adjust",
    name="transaction_type",
)
VIP_SOURCE_ENUM = postgresql.ENUM(
    "purchase", "admin_grant", "promo", "battle_pass", "shop", name="vip_source"
)
REWARD_TYPE_ENUM = postgresql.ENUM(
    "money", "car", "container", "skill", "vip", "battle_pass", "other", name="reward_type"
)
BROADCAST_CONTENT_TYPE_ENUM = postgresql.ENUM(
    "text", "photo", "video", "document", "animation", "voice", "sticker",
    name="broadcast_content_type",
)
BROADCAST_AUDIENCE_ENUM = postgresql.ENUM(
    "all", "ru", "en", "vip", "regular", "active", "inactive", "custom",
    name="broadcast_audience",
)
BROADCAST_SCHEDULE_ENUM = postgresql.ENUM("once", "daily", "weekly", name="broadcast_schedule")
BROADCAST_STATUS_ENUM = postgresql.ENUM(
    "draft", "scheduled", "sending", "sent", "stopped", name="broadcast_status"
)
DELIVERY_STATUS_ENUM = postgresql.ENUM("pending", "sent", "failed", "skipped", name="delivery_status")
OPERATION_STATUS_ENUM = postgresql.ENUM("pending", "completed", "failed", name="operation_status")

ALL_ENUMS = (
    LANGUAGE_ENUM, RARITY_ENUM, ROOM_SCOPE_ENUM, ROOM_STATUS_ENUM, AUCTION_STATUS_ENUM,
    OBTAINED_FROM_ENUM, SALE_STATUS_ENUM, TRANSACTION_TYPE_ENUM, VIP_SOURCE_ENUM,
    REWARD_TYPE_ENUM, BROADCAST_CONTENT_TYPE_ENUM, BROADCAST_AUDIENCE_ENUM,
    BROADCAST_SCHEDULE_ENUM, BROADCAST_STATUS_ENUM, DELIVERY_STATUS_ENUM, OPERATION_STATUS_ENUM,
)


def _ts_columns() -> list[sa.Column]:
    """created_at/updated_at, как в database.base.TimestampMixin."""
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    ]


def upgrade() -> None:
    bind = op.get_bind()
    for enum_type in ALL_ENUMS:
        enum_type.create(bind, checkfirst=True)

    def enum_col(enum_type: postgresql.ENUM) -> postgresql.ENUM:
        # create_type=False: тип уже создан выше, колонка не должна пытаться создать его снова.
        return postgresql.ENUM(*enum_type.enums, name=enum_type.name, create_type=False)

    # 1. users
    op.create_table(
        "users",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("username", sa.String(64), nullable=True),
        sa.Column("first_name", sa.String(255), nullable=True),
        sa.Column("language", enum_col(LANGUAGE_ENUM), nullable=False, server_default="ru"),
        sa.Column("balance", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("is_vip", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("vip_since", sa.DateTime(timezone=True), nullable=True),
        sa.Column("agreed_to_docs", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("agreed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_banned", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("ban_reason", sa.String(500), nullable=True),
        sa.Column("referred_by", sa.BigInteger(), nullable=True),
        sa.Column("last_daily_bonus_date", sa.Date(), nullable=True),
        *_ts_columns(),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["referred_by"], ["users.id"], ondelete="SET NULL"),
    )

    # 2. groups
    op.create_table(
        "groups",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("title", sa.String(255), nullable=True),
        sa.Column("language", enum_col(LANGUAGE_ENUM), nullable=False, server_default="ru"),
        sa.Column("auction_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("added_by", sa.BigInteger(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        *_ts_columns(),
        sa.PrimaryKeyConstraint("id"),
    )

    # 3. admins
    op.create_table(
        "admins",
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("permissions", sa.JSON(), nullable=False),
        sa.Column("granted_by", sa.BigInteger(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("granted_at", sa.DateTime(timezone=True), nullable=True),
        *_ts_columns(),
        sa.PrimaryKeyConstraint("user_id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )

    # 4. user_settings
    op.create_table(
        "user_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("key", sa.String(100), nullable=False),
        sa.Column("value", sa.JSON(), nullable=True),
        *_ts_columns(),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", "key", name="uq_user_settings_user_key"),
    )
    op.create_index("ix_user_settings_user_id", "user_settings", ["user_id"])

    # 5. user_stats
    op.create_table(
        "user_stats",
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("containers_opened", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("bids_made", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("wins", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cars_obtained", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cars_sold", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("earned_total", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("spent_total", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("container_profit", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("referrals_count", sa.Integer(), nullable=False, server_default="0"),
        *_ts_columns(),
        sa.PrimaryKeyConstraint("user_id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )

    # 6. group_members
    op.create_table(
        "group_members",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("group_id", sa.BigInteger(), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        *_ts_columns(),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["group_id"], ["groups.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("group_id", "user_id", name="uq_group_members_group_user"),
    )
    op.create_index("ix_group_members_group_id", "group_members", ["group_id"])
    op.create_index("ix_group_members_user_id", "group_members", ["user_id"])

    # 7. cars
    op.create_table(
        "cars",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("photo_file_id", sa.String(255), nullable=True),
        sa.Column("country", sa.String(100), nullable=True),
        sa.Column("rarity", enum_col(RARITY_ENUM), nullable=False),
        sa.Column("max_speed", sa.Integer(), nullable=False),
        sa.Column("accel_0_100", sa.Numeric(4, 2), nullable=False),
        sa.Column("power", sa.Integer(), nullable=False),
        sa.Column("handling", sa.Integer(), nullable=False),
        sa.Column("reliability", sa.Integer(), nullable=False),
        sa.Column("price", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        *_ts_columns(),
        sa.PrimaryKeyConstraint("id"),
    )

    # 8. containers
    op.create_table(
        "containers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("country", sa.String(100), nullable=True),
        sa.Column("photo_file_id", sa.String(255), nullable=True),
        sa.Column("price", sa.BigInteger(), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        *_ts_columns(),
        sa.PrimaryKeyConstraint("id"),
    )

    # 9. container_cars
    op.create_table(
        "container_cars",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("container_id", sa.Integer(), nullable=False),
        sa.Column("car_id", sa.Integer(), nullable=False),
        sa.Column("drop_weight", sa.Integer(), nullable=False, server_default="1"),
        *_ts_columns(),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["container_id"], ["containers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["car_id"], ["cars.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("container_id", "car_id", name="uq_container_cars_container_car"),
    )
    op.create_index("ix_container_cars_container_id", "container_cars", ["container_id"])
    op.create_index("ix_container_cars_car_id", "container_cars", ["car_id"])

    # 10. rooms
    op.create_table(
        "rooms",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("scope", enum_col(ROOM_SCOPE_ENUM), nullable=False),
        sa.Column("scope_id", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("room_number", sa.Integer(), nullable=False),
        sa.Column("status", enum_col(ROOM_STATUS_ENUM), nullable=False, server_default="open"),
        sa.Column("max_players", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("stop_requested", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        *_ts_columns(),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("scope", "scope_id", "room_number", name="uq_rooms_scope_number"),
    )

    # 11. room_members
    op.create_table(
        "room_members",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("room_id", sa.BigInteger(), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("missed_containers_streak", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("left_at", sa.DateTime(timezone=True), nullable=True),
        *_ts_columns(),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["room_id"], ["rooms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("room_id", "user_id", name="uq_room_members_room_user"),
    )
    op.create_index("ix_room_members_room_id", "room_members", ["room_id"])
    op.create_index("ix_room_members_user_id", "room_members", ["user_id"])

    # 12. garages
    op.create_table(
        "garages",
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("capacity", sa.Integer(), nullable=False, server_default="15"),
        *_ts_columns(),
        sa.PrimaryKeyConstraint("user_id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )

    # 13. user_cars
    op.create_table(
        "user_cars",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("car_id", sa.Integer(), nullable=False),
        sa.Column("obtained_from", enum_col(OBTAINED_FROM_ENUM), nullable=False),
        sa.Column("obtained_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_sold", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("sold_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sold_price", sa.BigInteger(), nullable=True),
        sa.Column("sell_prompt_expires_at", sa.DateTime(timezone=True), nullable=True),
        *_ts_columns(),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["car_id"], ["cars.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_user_cars_user_id", "user_cars", ["user_id"])
    op.create_index("ix_user_cars_car_id", "user_cars", ["car_id"])

    # 14. garage_upgrade_tiers
    op.create_table(
        "garage_upgrade_tiers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("new_capacity", sa.Integer(), nullable=False),
        sa.Column("price", sa.BigInteger(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        *_ts_columns(),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("new_capacity", name="uq_garage_upgrade_capacity"),
    )

    # 15. auctions
    op.create_table(
        "auctions",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("room_id", sa.BigInteger(), nullable=False),
        sa.Column("container_id", sa.Integer(), nullable=False),
        sa.Column("status", enum_col(AUCTION_STATUS_ENUM), nullable=False, server_default="active"),
        sa.Column("initial_bid", sa.BigInteger(), nullable=False),
        sa.Column("current_bid", sa.BigInteger(), nullable=False),
        sa.Column("current_leader_id", sa.BigInteger(), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("result_car_id", sa.Integer(), nullable=True),
        sa.Column("result_user_car_id", sa.BigInteger(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        *_ts_columns(),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["room_id"], ["rooms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["container_id"], ["containers.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["current_leader_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["result_car_id"], ["cars.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["result_user_car_id"], ["user_cars.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_auctions_room_id", "auctions", ["room_id"])

    # 16. auction_bids
    op.create_table(
        "auction_bids",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("auction_id", sa.BigInteger(), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("amount", sa.BigInteger(), nullable=False),
        *_ts_columns(),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["auction_id"], ["auctions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_auction_bids_auction_id", "auction_bids", ["auction_id"])
    op.create_index("ix_auction_bids_user_id", "auction_bids", ["user_id"])

    # 17. transactions
    op.create_table(
        "transactions",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("type", enum_col(TRANSACTION_TYPE_ENUM), nullable=False),
        sa.Column("amount", sa.BigInteger(), nullable=False),
        sa.Column("balance_after", sa.BigInteger(), nullable=False),
        sa.Column("operation_id", sa.String(64), nullable=True),
        sa.Column("description", sa.String(500), nullable=True),
        *_ts_columns(),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("operation_id", name="uq_transactions_operation_id"),
    )
    op.create_index("ix_transactions_user_id", "transactions", ["user_id"])
    op.create_index("ix_transactions_operation_id", "transactions", ["operation_id"])

    # 18. sales
    op.create_table(
        "sales",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("seller_id", sa.BigInteger(), nullable=False),
        sa.Column("buyer_id", sa.BigInteger(), nullable=False),
        sa.Column("user_car_id", sa.BigInteger(), nullable=False),
        sa.Column("price", sa.BigInteger(), nullable=False),
        sa.Column("commission_rate", sa.Numeric(5, 4), nullable=False),
        sa.Column("status", enum_col(SALE_STATUS_ENUM), nullable=False, server_default="pending"),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        *_ts_columns(),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["seller_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["buyer_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_car_id"], ["user_cars.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_sales_seller_id", "sales", ["seller_id"])
    op.create_index("ix_sales_buyer_id", "sales", ["buyer_id"])

    # 19. transfers
    op.create_table(
        "transfers",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("from_user_id", sa.BigInteger(), nullable=False),
        sa.Column("to_user_id", sa.BigInteger(), nullable=False),
        sa.Column("amount", sa.BigInteger(), nullable=False),
        sa.Column("commission_rate", sa.Numeric(5, 4), nullable=False),
        sa.Column("commission_amount", sa.BigInteger(), nullable=False),
        *_ts_columns(),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["from_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["to_user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_transfers_from_user_id", "transfers", ["from_user_id"])
    op.create_index("ix_transfers_to_user_id", "transfers", ["to_user_id"])

    # 20. vip_grants
    op.create_table(
        "vip_grants",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("source", enum_col(VIP_SOURCE_ENUM), nullable=False),
        sa.Column("price_paid", sa.BigInteger(), nullable=True),
        sa.Column("granted_by", sa.BigInteger(), nullable=True),
        *_ts_columns(),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_vip_grants_user_id", "vip_grants", ["user_id"])

    # 21. referrals
    op.create_table(
        "referrals",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("inviter_id", sa.BigInteger(), nullable=False),
        sa.Column("invited_id", sa.BigInteger(), nullable=False),
        sa.Column("inviter_bonus_paid", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("invited_bonus_paid", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("first_purchase_bonus_paid", sa.Boolean(), nullable=False, server_default=sa.false()),
        *_ts_columns(),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["inviter_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["invited_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("invited_id", name="uq_referrals_invited_id"),
    )
    op.create_index("ix_referrals_inviter_id", "referrals", ["inviter_id"])

    # 22. battle_passes
    op.create_table(
        "battle_passes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("price", sa.BigInteger(), nullable=False),
        sa.Column("levels_count", sa.Integer(), nullable=False),
        sa.Column("duration_days", sa.Integer(), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        *_ts_columns(),
        sa.PrimaryKeyConstraint("id"),
    )

    # 23. battle_pass_levels
    op.create_table(
        "battle_pass_levels",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("battle_pass_id", sa.Integer(), nullable=False),
        sa.Column("level_number", sa.Integer(), nullable=False),
        *_ts_columns(),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["battle_pass_id"], ["battle_passes.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("battle_pass_id", "level_number", name="uq_bp_level_number"),
    )
    op.create_index("ix_battle_pass_levels_battle_pass_id", "battle_pass_levels", ["battle_pass_id"])

    # 24. battle_pass_rewards
    op.create_table(
        "battle_pass_rewards",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("level_id", sa.Integer(), nullable=False),
        sa.Column("reward_type", enum_col(REWARD_TYPE_ENUM), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        *_ts_columns(),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["level_id"], ["battle_pass_levels.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_battle_pass_rewards_level_id", "battle_pass_rewards", ["level_id"])

    # 25. battle_pass_progress
    op.create_table(
        "battle_pass_progress",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("battle_pass_id", sa.Integer(), nullable=False),
        sa.Column("purchased_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("current_level", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_level_up_date", sa.Date(), nullable=True),
        sa.Column("opened_container_today", sa.Boolean(), nullable=False, server_default=sa.false()),
        *_ts_columns(),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["battle_pass_id"], ["battle_passes.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", "battle_pass_id", name="uq_bp_progress_user_bp"),
    )
    op.create_index("ix_battle_pass_progress_user_id", "battle_pass_progress", ["user_id"])
    op.create_index("ix_battle_pass_progress_battle_pass_id", "battle_pass_progress", ["battle_pass_id"])

    # 26. shop_settings
    op.create_table(
        "shop_settings",
        sa.Column("id", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        *_ts_columns(),
        sa.PrimaryKeyConstraint("id"),
    )

    # 27. shop_lots
    op.create_table(
        "shop_lots",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("photo_file_id", sa.String(255), nullable=True),
        sa.Column("price", sa.BigInteger(), nullable=False),
        sa.Column("is_available", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("available_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("available_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        *_ts_columns(),
        sa.PrimaryKeyConstraint("id"),
    )

    # 28. shop_lot_items
    op.create_table(
        "shop_lot_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("lot_id", sa.Integer(), nullable=False),
        sa.Column("item_type", enum_col(REWARD_TYPE_ENUM), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        *_ts_columns(),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["lot_id"], ["shop_lots.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_shop_lot_items_lot_id", "shop_lot_items", ["lot_id"])

    # 29. purchases
    op.create_table(
        "purchases",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("lot_id", sa.Integer(), nullable=False),
        sa.Column("price_paid", sa.BigInteger(), nullable=False),
        *_ts_columns(),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["lot_id"], ["shop_lots.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_purchases_user_id", "purchases", ["user_id"])

    # 30. promo_codes
    op.create_table(
        "promo_codes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("rewards", sa.JSON(), nullable=False),
        sa.Column("activation_limit", sa.Integer(), nullable=True),
        sa.Column("activations_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by", sa.BigInteger(), nullable=False),
        *_ts_columns(),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code", name="uq_promo_codes_code"),
    )
    op.create_index("ix_promo_codes_code", "promo_codes", ["code"])

    # 31. promo_redemptions
    op.create_table(
        "promo_redemptions",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("promo_code_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        *_ts_columns(),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["promo_code_id"], ["promo_codes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("promo_code_id", "user_id", name="uq_promo_redemption_code_user"),
    )
    op.create_index("ix_promo_redemptions_promo_code_id", "promo_redemptions", ["promo_code_id"])
    op.create_index("ix_promo_redemptions_user_id", "promo_redemptions", ["user_id"])

    # 32. skills
    op.create_table(
        "skills",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("effect", sa.JSON(), nullable=False),
        sa.Column("max_level", sa.Integer(), nullable=False, server_default="1"),
        *_ts_columns(),
        sa.PrimaryKeyConstraint("id"),
    )

    # 33. user_skills
    op.create_table(
        "user_skills",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("skill_id", sa.Integer(), nullable=False),
        sa.Column("level", sa.Integer(), nullable=False, server_default="1"),
        *_ts_columns(),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["skill_id"], ["skills.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", "skill_id", name="uq_user_skills_user_skill"),
    )
    op.create_index("ix_user_skills_user_id", "user_skills", ["user_id"])
    op.create_index("ix_user_skills_skill_id", "user_skills", ["skill_id"])

    # 34. history_events
    op.create_table(
        "history_events",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=True),
        sa.Column("actor_admin_id", sa.BigInteger(), nullable=True),
        sa.Column("event_type", sa.String(100), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("operation_id", sa.String(64), nullable=True),
        *_ts_columns(),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_history_events_user_id", "history_events", ["user_id"])
    op.create_index("ix_history_events_event_type", "history_events", ["event_type"])
    op.create_index("ix_history_events_operation_id", "history_events", ["operation_id"])

    # 35. broadcasts
    op.create_table(
        "broadcasts",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("created_by", sa.BigInteger(), nullable=False),
        sa.Column("content_type", enum_col(BROADCAST_CONTENT_TYPE_ENUM), nullable=False),
        sa.Column("text", sa.Text(), nullable=True),
        sa.Column("media_file_id", sa.String(255), nullable=True),
        sa.Column("buttons", sa.JSON(), nullable=True),
        sa.Column("audience", enum_col(BROADCAST_AUDIENCE_ENUM), nullable=False),
        sa.Column("audience_filter", sa.JSON(), nullable=True),
        sa.Column("schedule_type", enum_col(BROADCAST_SCHEDULE_ENUM), nullable=False, server_default="once"),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", enum_col(BROADCAST_STATUS_ENUM), nullable=False, server_default="draft"),
        *_ts_columns(),
        sa.PrimaryKeyConstraint("id"),
    )

    # 36. broadcast_targets
    op.create_table(
        "broadcast_targets",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("broadcast_id", sa.BigInteger(), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("status", enum_col(DELIVERY_STATUS_ENUM), nullable=False, server_default="pending"),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error", sa.String(), nullable=True),
        *_ts_columns(),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["broadcast_id"], ["broadcasts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("broadcast_id", "user_id", name="uq_broadcast_targets_broadcast_user"),
    )
    op.create_index("ix_broadcast_targets_broadcast_id", "broadcast_targets", ["broadcast_id"])
    op.create_index("ix_broadcast_targets_user_id", "broadcast_targets", ["user_id"])

    # 37. documentation_pages
    op.create_table(
        "documentation_pages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("section_key", sa.String(100), nullable=False),
        sa.Column("language", enum_col(LANGUAGE_ENUM), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("updated_by", sa.BigInteger(), nullable=True),
        *_ts_columns(),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("section_key", "language", name="uq_documentation_section_lang"),
    )
    op.create_index("ix_documentation_pages_section_key", "documentation_pages", ["section_key"])

    # 38. settings
    op.create_table(
        "settings",
        sa.Column("key", sa.String(100), nullable=False),
        sa.Column("value", sa.JSON(), nullable=False),
        sa.Column("updated_by", sa.BigInteger(), nullable=True),
        *_ts_columns(),
        sa.PrimaryKeyConstraint("key"),
    )

    # 39. operations
    op.create_table(
        "operations",
        sa.Column("id", sa.String(64), nullable=False),
        sa.Column("type", sa.String(100), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=True),
        sa.Column("status", enum_col(OPERATION_STATUS_ENUM), nullable=False, server_default="pending"),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("result", sa.JSON(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        *_ts_columns(),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_operations_type", "operations", ["type"])
    op.create_index("ix_operations_user_id", "operations", ["user_id"])


def downgrade() -> None:
    bind = op.get_bind()

    for table in (
        "operations", "settings", "documentation_pages", "broadcast_targets", "broadcasts",
        "history_events", "user_skills", "skills", "promo_redemptions", "promo_codes",
        "purchases", "shop_lot_items", "shop_lots", "shop_settings", "battle_pass_progress",
        "battle_pass_rewards", "battle_pass_levels", "battle_passes", "referrals", "vip_grants",
        "transfers", "sales", "transactions", "auction_bids", "auctions", "garage_upgrade_tiers",
        "user_cars", "garages", "room_members", "rooms", "container_cars", "containers", "cars",
        "group_members", "user_stats", "user_settings", "admins", "groups", "users",
    ):
        op.drop_table(table)

    for enum_type in reversed(ALL_ENUMS):
        enum_type.drop(bind, checkfirst=True)
