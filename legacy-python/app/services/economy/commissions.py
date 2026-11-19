"""Комиссии по типам операций — единая точка чтения из Setting (раздел
11/14/15/16 ТЗ: 'комиссии должны редактироваться через админку', не
хардкодить). Формат значения в Setting одинаковый для всех:
{"regular": 0.10, "vip": 0.05}."""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.settings import SettingsRepository

DEFAULT_COMMISSIONS: dict[str, dict[str, float]] = {
    "commission_quick_sell": {"regular": 0.10, "vip": 0.05},
    "commission_sell_state": {"regular": 0.40, "vip": 0.30},
    "commission_sell_player": {"regular": 0.25, "vip": 0.15},
    "commission_transfer": {"regular": 0.10, "vip": 0.0},
}


async def get_commission_rate(session: AsyncSession, setting_key: str, is_vip: bool) -> float:
    default = DEFAULT_COMMISSIONS[setting_key]
    rates = await SettingsRepository(session).get_value(setting_key, default)
    return float(rates["vip"] if is_vip else rates["regular"])
