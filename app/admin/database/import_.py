"""Импорт игровой конфигурации из файла, созданного export.py. Импорт
ОБЯЗАТЕЛЬНО подтверждается (раздел 27 ТЗ): сначала краткая сводка того,
что будет применено, и только по кнопке 'Подтвердить' изменения пишутся
в БД — одной атомарной транзакцией, чтобы частично применённый файл не
оставил данные в промежуточном состоянии."""
from __future__ import annotations

import json

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.admin.permissions import require_permission
from app.callbacks.admin import AdminDatabaseCallback
from app.core.context import RequestContext
from app.core.enums import Language, RewardType
from app.core.exceptions import AppError
from app.database.transaction import atomic
from app.keyboards.admin import admin_database_confirm_keyboard
from app.localization.manager import t
from app.repositories.car import CarRepository
from app.repositories.container import ContainerCarRepository, ContainerRepository
from app.repositories.documentation import DocumentationRepository
from app.repositories.garage import GarageUpgradeTierRepository
from app.repositories.promo import PromoCodeRepository
from app.repositories.settings import SettingsRepository
from app.repositories.shop import ShopLotItemRepository, ShopLotRepository
from app.states.admin_database import AdminDatabaseStates

router = Router(name="admin_database_import")


@router.callback_query(AdminDatabaseCallback.filter(F.action == "import_prompt"))
async def on_import_prompt(
    query: CallbackQuery, callback_data: AdminDatabaseCallback, ctx: RequestContext, state: FSMContext
) -> None:
    if not await require_permission(query, ctx, "backups"):
        return
    await state.set_state(AdminDatabaseStates.waiting_for_import_file)
    if query.message is not None:
        await query.message.answer(t("admin_db_import_prompt", ctx.language))
    await query.answer()


@router.message(AdminDatabaseStates.waiting_for_import_file)
async def on_import_file(message: Message, ctx: RequestContext, state: FSMContext) -> None:
    if message.document is None:
        raise AppError(t("admin_db_import_need_file", ctx.language))

    file = await message.bot.download(message.document)
    try:
        payload = json.loads(file.read().decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise AppError(t("admin_db_import_invalid_file", ctx.language)) from exc

    summary = t(
        "admin_db_import_summary", ctx.language,
        cars=len(payload.get("cars", [])),
        containers=len(payload.get("containers", [])),
        settings=len(payload.get("settings", {})),
        lots=len(payload.get("shop_lots", [])),
        promos=len(payload.get("promo_codes", [])),
    )
    await state.update_data(admin_import_payload=payload)
    await state.set_state(AdminDatabaseStates.waiting_for_import_confirm)
    await message.answer(
        t("admin_import_confirm", ctx.language) + "\n\n" + summary,
        reply_markup=admin_database_confirm_keyboard(ctx.language),
    )


@router.callback_query(AdminDatabaseCallback.filter(F.action == "import_cancel"))
async def on_import_cancel(
    query: CallbackQuery, callback_data: AdminDatabaseCallback, ctx: RequestContext, state: FSMContext
) -> None:
    await state.clear()
    if query.message is not None:
        await query.message.edit_text(t("admin_db_import_cancelled", ctx.language))
    await query.answer()


@router.callback_query(AdminDatabaseCallback.filter(F.action == "import_confirm"))
async def on_import_confirm(
    query: CallbackQuery, callback_data: AdminDatabaseCallback, ctx: RequestContext, state: FSMContext
) -> None:
    data = await state.get_data()
    payload = data.get("admin_import_payload")
    await state.clear()
    if payload is None:
        await query.answer(t("error_generic", ctx.language), show_alert=True)
        return

    await _apply_import(ctx, payload)

    if query.message is not None:
        await query.message.edit_text(t("admin_db_import_done", ctx.language))
    await query.answer()


async def _apply_import(ctx: RequestContext, payload: dict) -> None:
    async with atomic(ctx.session):
        car_repo = CarRepository(ctx.session)
        for row in payload.get("cars", []):
            fields = {k: v for k, v in row.items() if k != "id"}
            if await car_repo.get(row["id"]) is None:
                await car_repo.create(id=row["id"], **fields)
            else:
                await car_repo.update_fields(row["id"], **fields)

        container_repo = ContainerRepository(ctx.session)
        for row in payload.get("containers", []):
            fields = {k: v for k, v in row.items() if k != "id"}
            if await container_repo.get(row["id"]) is None:
                await container_repo.create(id=row["id"], **fields)
            else:
                await container_repo.update_fields(row["id"], **fields)

        link_repo = ContainerCarRepository(ctx.session)
        for row in payload.get("container_cars", []):
            existing_ids = {link.car_id for link in await link_repo.list_for_container(row["container_id"])}
            if row["car_id"] in existing_ids:
                await link_repo.set_weight(row["container_id"], row["car_id"], row["drop_weight"])
            else:
                await link_repo.add_car(row["container_id"], row["car_id"], row["drop_weight"])

        tier_repo = GarageUpgradeTierRepository(ctx.session)
        for row in payload.get("garage_upgrade_tiers", []):
            await tier_repo.upsert(row["new_capacity"], row["price"])

        settings_repo = SettingsRepository(ctx.session)
        for key, value in payload.get("settings", {}).items():
            await settings_repo.set_value(key, value, ctx.user.id)

        lot_repo = ShopLotRepository(ctx.session)
        item_repo = ShopLotItemRepository(ctx.session)
        for row in payload.get("shop_lots", []):
            fields = {k: v for k, v in row.items() if k != "id"}
            if await lot_repo.get(row["id"]) is None:
                await lot_repo.create(id=row["id"], **fields)
            else:
                await lot_repo.update_fields(row["id"], **fields)
        for row in payload.get("shop_lot_items", []):
            await item_repo.add_item(row["lot_id"], RewardType(row["item_type"]), row["payload"], row["quantity"])

        promo_repo = PromoCodeRepository(ctx.session)
        for row in payload.get("promo_codes", []):
            if await promo_repo.get_by_code(row["code"]) is None:
                await promo_repo.create(
                    code=row["code"], rewards=row["rewards"],
                    activation_limit=row.get("activation_limit"),
                    is_active=row.get("is_active", True), created_by=ctx.user.id,
                )

        doc_repo = DocumentationRepository(ctx.session)
        for row in payload.get("documentation", []):
            await doc_repo.upsert(
                row["section_key"], Language(row["language"]), row["title"], row["content"], ctx.user.id
            )
