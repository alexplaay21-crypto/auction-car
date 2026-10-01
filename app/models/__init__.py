"""Импорт всех моделей, чтобы они зарегистрировались в Base.metadata
(нужно для Alembic autogenerate и для create_all в тестах).
"""
from __future__ import annotations

from app.models.admin import Admin
from app.models.auction import Auction
from app.models.auction_bid import AuctionBid
from app.models.battle_pass import BattlePass
from app.models.battle_pass_level import BattlePassLevel
from app.models.battle_pass_progress import BattlePassProgress
from app.models.battle_pass_reward import BattlePassReward
from app.models.broadcast import Broadcast
from app.models.broadcast_target import BroadcastTarget
from app.models.car import Car
from app.models.container import Container
from app.models.container_car import ContainerCar
from app.models.documentation import DocumentationPage
from app.models.garage import Garage, UserCar
from app.models.garage_upgrade import GarageUpgradeTier
from app.models.group import Group
from app.models.group_member import GroupMember
from app.models.history import HistoryEvent
from app.models.operation import Operation
from app.models.promo_code import PromoCode
from app.models.promo_redemption import PromoRedemption
from app.models.purchase import Purchase
from app.models.referral import Referral
from app.models.room import Room
from app.models.room_member import RoomMember
from app.models.sale import Sale
from app.models.setting import Setting
from app.models.shop import ShopSettings
from app.models.shop_lot import ShopLot
from app.models.shop_lot_item import ShopLotItem
from app.models.skill import Skill
from app.models.transaction import Transaction
from app.models.transfer import Transfer
from app.models.user_container import UserContainer
from app.models.user import User
from app.models.user_settings import UserSetting
from app.models.user_skill import UserSkill
from app.models.user_stats import UserStats
from app.models.vip import VipGrant

from app.database.base import Base  # noqa: E402,F401

__all__ = [
    "Admin",
    "Auction",
    "AuctionBid",
    "BattlePass",
    "BattlePassLevel",
    "BattlePassProgress",
    "BattlePassReward",
    "Broadcast",
    "BroadcastTarget",
    "Car",
    "Container",
    "ContainerCar",
    "DocumentationPage",
    "Garage",
    "UserCar",
    "GarageUpgradeTier",
    "Group",
    "GroupMember",
    "HistoryEvent",
    "Operation",
    "PromoCode",
    "PromoRedemption",
    "Purchase",
    "Referral",
    "Room",
    "RoomMember",
    "Sale",
    "Setting",
    "ShopSettings",
    "ShopLot",
    "ShopLotItem",
    "Skill",
    "Transaction",
    "Transfer",
    "User",
    "UserContainer",
    "UserSetting",
    "UserSkill",
    "UserStats",
    "VipGrant",
    "Base",
]
