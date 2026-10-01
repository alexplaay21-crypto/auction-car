"""Общие перечисления, используемые моделями/сервисами по всему проекту."""
from __future__ import annotations

import enum


class Language(str, enum.Enum):
    RU = "ru"
    EN = "en"


class Rarity(str, enum.Enum):
    COMMON = "common"
    RARE = "rare"
    EPIC = "epic"
    MYTHIC = "mythic"


class RoomScope(str, enum.Enum):
    GROUP = "group"
    PRIVATE = "private"


class RoomStatus(str, enum.Enum):
    OPEN = "open"       # набирает игроков
    FULL = "full"        # заполнена, аукцион идёт
    CLOSED = "closed"     # завершена (по /stop или иначе)


class AuctionStatus(str, enum.Enum):
    ACTIVE = "active"
    ENDED_WON = "ended_won"
    ENDED_NO_BIDS = "ended_no_bids"
    CANCELLED = "cancelled"


class ObtainedFrom(str, enum.Enum):
    CONTAINER = "container"
    SHOP = "shop"
    ADMIN_GRANT = "admin_grant"
    TRANSFER = "transfer"
    PROMO = "promo"
    BATTLE_PASS = "battle_pass"


class SaleStatus(str, enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"
    EXPIRED = "expired"


class TransactionType(str, enum.Enum):
    BET = "bet"
    BET_REFUND = "bet_refund"
    CONTAINER_WIN_COST = "container_win_cost"
    SELL_STATE = "sell_state"
    SELL_PLAYER_INCOME = "sell_player_income"
    BUY_PLAYER_CAR = "buy_player_car"
    QUICK_SELL = "quick_sell"
    TRANSFER_OUT = "transfer_out"
    TRANSFER_IN = "transfer_in"
    DAILY_BONUS = "daily_bonus"
    REFERRAL_BONUS = "referral_bonus"
    SHOP_PURCHASE = "shop_purchase"
    PROMO_REWARD = "promo_reward"
    BATTLE_PASS_PURCHASE = "battle_pass_purchase"
    BATTLE_PASS_REWARD = "battle_pass_reward"
    VIP_PURCHASE = "vip_purchase"
    GARAGE_UPGRADE = "garage_upgrade"
    ADMIN_ADJUST = "admin_adjust"


class VipSource(str, enum.Enum):
    PURCHASE = "purchase"
    ADMIN_GRANT = "admin_grant"
    PROMO = "promo"
    BATTLE_PASS = "battle_pass"
    SHOP = "shop"


class RewardType(str, enum.Enum):
    MONEY = "money"
    CAR = "car"
    CONTAINER = "container"
    SKILL = "skill"
    VIP = "vip"
    BATTLE_PASS = "battle_pass"
    OTHER = "other"


class BroadcastContentType(str, enum.Enum):
    TEXT = "text"
    PHOTO = "photo"
    VIDEO = "video"
    DOCUMENT = "document"
    ANIMATION = "animation"
    VOICE = "voice"
    STICKER = "sticker"


class BroadcastAudience(str, enum.Enum):
    ALL = "all"
    RU = "ru"
    EN = "en"
    VIP = "vip"
    REGULAR = "regular"
    ACTIVE = "active"
    INACTIVE = "inactive"
    CUSTOM = "custom"


class BroadcastSchedule(str, enum.Enum):
    ONCE = "once"
    DAILY = "daily"
    WEEKLY = "weekly"


class BroadcastStatus(str, enum.Enum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    SENDING = "sending"
    SENT = "sent"
    STOPPED = "stopped"


class DeliveryStatus(str, enum.Enum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"
    SKIPPED = "skipped"


class OperationStatus(str, enum.Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"
