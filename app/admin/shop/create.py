"""Создание лота: название | цена | описание (описание можно опустить)."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.admin.permissions import require_permission
from app.admin.shop.list import render_lot_admin_card
from app.callbacks.admin import AdminShopCallback
from app.core.context import RequestContext
from app.core.exceptions import AppError
from app.keyboards.admin import admin_shop_lot_keyboard
from app.localization.manager import t
from app.repositories.shop import ShopLotRepository
from app.states.admin_shop import AdminShopStates

router = Router(name="admin_shop_create")


def parse_lot_create(text: str) -> dict:
    parts = [p.strip() for p in text.split("|")]
    if len(parts) not in (2, 3) or not parts[0] or not parts[1].isdigit():
        raise ValueError("format")
    return {"title": parts[0], "price": int(parts[1]), "description": parts[2] if len(parts) == 3 else None}


@router.callback_query(AdminShopCallback.filter(F.action == "create"))
async def on_create_prompt(
    query: CallbackQuery, callback_data: AdminShopCallback, ctx: RequestContext, state: FSMContext
) -> None:
    if not await require_permission(query, ctx, "shop"):
        return
    await state.set_state(AdminShopStates.waiting_for_create)
    if query.message is not None:
        await query.message.answer(t("admin_shop_create_prompt", ctx.language))
    await query.answer()


@router.message(AdminShopStates.waiting_for_create)
async def on_create_data(message: Message, ctx: RequestContext, state: FSMContext) -> None:
    text = message.caption if message.photo else message.text
    try:
        fields = parse_lot_create(text or "")
    except ValueError as exc:
        raise AppError(t("admin_format_invalid", ctx.language)) from exc

    if message.photo:
        fields["photo_file_id"] = message.photo[-1].file_id

    lot = await ShopLotRepository(ctx.session).create(**fields)
    await state.clear()

    await message.answer(
        t("admin_shop_created", ctx.language, lot_id=lot.id) + "\n\n" + await render_lot_admin_card(ctx, lot),
        reply_markup=admin_shop_lot_keyboard(ctx.language, lot),
    )
