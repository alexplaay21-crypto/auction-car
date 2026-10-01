"""Импорт всех репозиториев для удобного доступа: from app.repositories import UserRepository."""
from __future__ import annotations

from app.repositories.base import BaseRepository

from app.repositories.auction import AuctionRepository, AuctionBidRepository
from app.repositories.battle_pass import BattlePassRepository, BattlePassLevelRepository, BattlePassRewardRepository, BattlePassProgressRepository
from app.repositories.broadcast import BroadcastRepository, BroadcastTargetRepository
from app.repositories.car import CarRepository
from app.repositories.container import ContainerRepository, ContainerCarRepository
from app.repositories.documentation import DocumentationRepository
from app.repositories.garage import GarageRepository, UserCarRepository, GarageUpgradeTierRepository
from app.repositories.group import GroupRepository, GroupMemberRepository
from app.repositories.history import HistoryRepository
from app.repositories.promo import PromoCodeRepository, PromoRedemptionRepository
from app.repositories.referral import ReferralRepository
from app.repositories.room import RoomRepository, RoomMemberRepository
from app.repositories.settings import SettingsRepository
from app.repositories.shop import ShopSettingsRepository, ShopLotRepository, ShopLotItemRepository, PurchaseRepository
from app.repositories.skill import SkillRepository, UserSkillRepository
from app.repositories.transaction import TransactionRepository, SaleRepository, TransferRepository
from app.repositories.user import UserRepository, AdminRepository, UserSettingRepository, UserStatsRepository
from app.repositories.vip import VipGrantRepository

__all__ = [
    "BaseRepository",
    "AuctionRepository",
    "AuctionBidRepository",
    "BattlePassRepository",
    "BattlePassLevelRepository",
    "BattlePassRewardRepository",
    "BattlePassProgressRepository",
    "BroadcastRepository",
    "BroadcastTargetRepository",
    "CarRepository",
    "ContainerRepository",
    "ContainerCarRepository",
    "DocumentationRepository",
    "GarageRepository",
    "UserCarRepository",
    "GarageUpgradeTierRepository",
    "GroupRepository",
    "GroupMemberRepository",
    "HistoryRepository",
    "PromoCodeRepository",
    "PromoRedemptionRepository",
    "ReferralRepository",
    "RoomRepository",
    "RoomMemberRepository",
    "SettingsRepository",
    "ShopSettingsRepository",
    "ShopLotRepository",
    "ShopLotItemRepository",
    "PurchaseRepository",
    "SkillRepository",
    "UserSkillRepository",
    "TransactionRepository",
    "SaleRepository",
    "TransferRepository",
    "UserRepository",
    "AdminRepository",
    "UserSettingRepository",
    "UserStatsRepository",
    "VipGrantRepository",
]
