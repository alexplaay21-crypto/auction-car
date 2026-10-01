"""Экспорт игровой конфигурации (раздел 27 ТЗ) — каталог машин, контейнеры
и их состав, тарифы гаража, Setting, лоты магазина и их содержимое,
промокоды, активный Battle Pass с уровнями и наградами, документация —
JSON-файлом.

Это НЕ полный бэкап БД: балансы игроков, историю ставок, гаражи и т.д. не
включает — их резервирует отдельная система на этапе Backups (pg_dump,
файл для восстановления через psql, а не через Telegram-чат). Здесь —
именно то, что реально правится через эту админку, чтобы можно было
перенести настройки между окружениями или откатиться после неудачной
правки."""
from __future__ import annotations

import datetime as dt
import json

from aiogram import F, Router
from aiogram.types import BufferedInputFile, CallbackQuery

from app.admin.permissions import require_permission
from app.callbacks.admin import AdminDatabaseCallback, AdminMenuCallback
from app.core.context import RequestContext
from app.core.enums import Language
from app.keyboards.admin import admin_database_keyboard
from app.localization.manager import t
from app.repositories.battle_pass import (
    BattlePassLevelRepository,
    BattlePassRepository,
    BattlePassRewardRepository,
)
from app.repositories.car import CarRepository
from app.repositories.container import ContainerCarRepository, ContainerRepository
from app.repositories.documentation import DocumentationRepository
from app.repositories.garage import GarageUpgradeTierRepository
from app.repositories.promo import PromoCodeRepository
from app.repositories.settings import SettingsRepository
from app.repositories.shop import ShopLotItemRepository, ShopLotRepository

router = Router(name="admin_database_export")


async def build_export_payload(ctx: RequestContext) -> dict:
    cars = await CarRepository(ctx.session).list_all(limit=10_000)
    containers = await ContainerRepository(ctx.session).list_all(limit=10_000)

    container_cars = []
    for container in containers:
        rows = await ContainerCarRepository(ctx.session).list_for_container_with_car(container.id)
        for link, _car in rows:
            container_cars.append(
                {"container_id": container.id, "car_id": link.car_id, "drop_weight": link.drop_weight}
            )

    tiers = await GarageUpgradeTierRepository(ctx.session).list_ordered()
    settings_map = await SettingsRepository(ctx.session).get_all()

    lots = await ShopLotRepository(ctx.session).list_all(limit=10_000)
    lot_items = []
    for lot in lots:
        for item in await ShopLotItemRepository(ctx.session).list_for_lot(lot.id):
            lot_items.append(
                {
                    "lot_id": lot.id, "item_type": item.item_type.value,
                    "payload": item.payload, "quantity": item.quantity,
                }
            )

    promos = await PromoCodeRepository(ctx.session).list_all()

    bp = await BattlePassRepository(ctx.session).get_active()
    bp_data = None
    if bp is not None:
        levels_data = []
        for level in await BattlePassLevelRepository(ctx.session).list_for_pass(bp.id):
            rewards = await BattlePassRewardRepository(ctx.session).list_for_level(level.id)
            levels_data.append(
                {
                    "level_number": level.level_number,
                    "rewards": [{"reward_type": r.reward_type.value, "payload": r.payload} for r in rewards],
                }
            )
        bp_data = {
            "name": bp.name, "price": bp.price, "levels_count": bp.levels_count,
            "duration_days": bp.duration_days, "levels": levels_data,
        }

    docs = []
    for language in (Language.RU, Language.EN):
        for page in await DocumentationRepository(ctx.session).list_sections(language):
            docs.append(
                {
                    "section_key": page.section_key, "language": language.value,
                    "title": page.title, "content": page.content,
                }
            )

    return {
        "exported_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "cars": [
            {
                "id": c.id, "name": c.name, "country": c.country, "rarity": c.rarity.value,
                "max_speed": c.max_speed, "accel_0_100": str(c.accel_0_100), "power": c.power,
                "handling": c.handling, "reliability": c.reliability, "price": c.price,
                "is_active": c.is_active, "photo_file_id": c.photo_file_id,
            }
            for c in cars
        ],
        "containers": [
            {
                "id": c.id, "name": c.name, "country": c.country, "price": c.price,
                "is_enabled": c.is_enabled, "photo_file_id": c.photo_file_id,
            }
            for c in containers
        ],
        "container_cars": container_cars,
        "garage_upgrade_tiers": [
            {"new_capacity": tier.new_capacity, "price": tier.price, "sort_order": tier.sort_order}
            for tier in tiers
        ],
        "settings": settings_map,
        "shop_lots": [
            {
                "id": lot.id, "title": lot.title, "description": lot.description, "price": lot.price,
                "is_available": lot.is_available, "sort_order": lot.sort_order,
            }
            for lot in lots
        ],
        "shop_lot_items": lot_items,
        "promo_codes": [
            {
                "code": p.code, "rewards": p.rewards, "activation_limit": p.activation_limit,
                "is_active": p.is_active,
            }
            for p in promos
        ],
        "battle_pass": bp_data,
        "documentation": docs,
    }


@router.callback_query(AdminMenuCallback.filter(F.section == "database"))
async def on_open_database_section(
    query: CallbackQuery, callback_data: AdminMenuCallback, ctx: RequestContext
) -> None:
    if not await require_permission(query, ctx, "backups"):
        return
    if query.message is not None:
        await query.message.edit_text(
            t("admin_db_title", ctx.language), reply_markup=admin_database_keyboard(ctx.language)
        )
    await query.answer()


@router.callback_query(AdminDatabaseCallback.filter(F.action == "export"))
async def on_export(query: CallbackQuery, callback_data: AdminDatabaseCallback, ctx: RequestContext) -> None:
    if not await require_permission(query, ctx, "backups"):
        return
    payload = await build_export_payload(ctx)
    data = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
    filename = f"car_auction_bot_config_{dt.datetime.now(dt.timezone.utc):%Y%m%d_%H%M%S}.json"

    if query.message is not None:
        await query.message.answer_document(
            BufferedInputFile(data, filename=filename), caption=t("admin_db_export_done", ctx.language)
        )
    await query.answer()
