"""Правка полей лота (поле=значение: title, description, price) и
добавление предмета в состав (тип payload_json количество)."""
from __future__ import annotations

import json

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.admin.permissions import require_permission
from app.admin.shop.list import render_lot_admin_card
from app.callbacks.admin import AdminShopCallback
from app.core.context import RequestContext
from app.core.enums import RewardType
from app.core.exceptions import AppError
from app.keyboards.admin import admin_shop_lot_keyboard
from app.localization.manager import t
from app.repositories.shop import ShopLotItemRepository, ShopLotRepository
from app.states.admin_shop import AdminShopStates

router = Router(name="admin_shop_edit")

EDITABLE_FIELDS = ("title", "description", "price")


@router.callback_query(AdminShopCallback.filter(F.action == "edit"))
async def on_edit_prompt(
    query: CallbackQuery, callback_data: AdminShopCallback, ctx: RequestContext, state: FSMContext
) -> None:
    if not await require_permission(query, ctx, "shop"):
        return
    await state.set_state(AdminShopStates.waiting_for_edit)
    await state.update_data(admin_lot_id=callback_data.lot_id)
    if query.message is not None:
        await query.message.answer(t("admin_shop_edit_prompt", ctx.language))
    await query.answer()


@router.callback_query(AdminShopCallback.filter(F.action == "add_item"))
async def on_add_item_prompt(
    query: CallbackQuery, callback_data: AdminShopCallback, ctx: RequestContext, state: FSMContext
) -> None:
    if not await require_permission(query, ctx, "shop"):
        return
    await state.set_state(AdminShopStates.waiting_for_add_item)
    await state.update_data(admin_lot_id=callback_data.lot_id)
    if query.message is not None:
        await query.message.answer(t("admin_shop_add_item_prompt", ctx.language))
    await query.answer()


@router.message(AdminShopStates.waiting_for_edit)
async def on_edit_data(message: Message, ctx: RequestContext, state: FSMContext) -> None:
    lot_id = (await state.get_data()).get("admin_lot_id")
    updates: dict = {}
    try:
        for line in (message.text or "").splitlines():
            if not line.strip():
                continue
            field, _, raw = line.partition("=")
            field, raw = field.strip().lower(), raw.strip()
            if field not in EDITABLE_FIELDS:
                raise ValueError(field)
            updates[field] = int(raw) if field == "price" else (raw or None)
        if not updates or lot_id is None:
            raise ValueError("empty")
    except (ValueError, TypeError) as exc:
        raise AppError(t("admin_format_invalid", ctx.language)) from exc

    repo = ShopLotRepository(ctx.session)
    await repo.update_fields(lot_id, **updates)
    await state.clear()

    lot = await repo.get(lot_id)
    await ctx.session.refresh(lot)
    await message.answer(
        t("admin_action_done", ctx.language) + "\n\n" + await render_lot_admin_card(ctx, lot),
        reply_markup=admin_shop_lot_keyboard(ctx.language, lot),
    )


@router.message(AdminShopStates.waiting_for_add_item)
async def on_add_item_data(message: Message, ctx: RequestContext, state: FSMContext) -> None:
    lot_id = (await state.get_data()).get("admin_lot_id")
    text = (message.text or "").strip()
    parts = text.split(maxsplit=2)
    try:
        if lot_id is None or len(parts) != 3:
            raise ValueError("format")
        item_type = RewardType(parts[0].lower())
        payload = json.loads(parts[1])
        quantity = int(parts[2])
        if not isinstance(payload, dict) or quantity < 1:
            raise ValueError("format")
    except (ValueError, TypeError, json.JSONDecodeError) as exc:
        raise AppError(t("admin_shop_item_invalid", ctx.language)) from exc

    await ShopLotItemRepository(ctx.session).add_item(lot_id, item_type, payload, quantity)
    await ctx.session.flush()
    await state.clear()

    lot = await ShopLotRepository(ctx.session).get(lot_id)
    await message.answer(
        t("admin_action_done", ctx.language) + "\n\n" + await render_lot_admin_card(ctx, lot),
        reply_markup=admin_shop_lot_keyboard(ctx.language, lot),
    )
