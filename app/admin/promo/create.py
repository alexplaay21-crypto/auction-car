"""Создание промокода: код | лимит_или_- | rewards_json.
Пример: WELCOME2026 | 100 | [{"type": "money", "amount": 5000}]"""
from __future__ import annotations

import json

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.admin.permissions import require_permission
from app.admin.promo.list import render_promo_admin_card
from app.callbacks.admin import AdminPromoCallback
from app.core.context import RequestContext
from app.core.exceptions import AppError
from app.keyboards.admin import admin_promo_card_keyboard
from app.localization.manager import t
from app.repositories.promo import PromoCodeRepository
from app.states.admin_promo import AdminPromoStates

router = Router(name="admin_promo_create")


def parse_promo_create(text: str) -> dict:
    parts = [p.strip() for p in text.split("|", maxsplit=2)]
    if len(parts) != 3 or not parts[0]:
        raise ValueError("format")
    limit = None if parts[1] in ("-", "") else int(parts[1])
    rewards = json.loads(parts[2])
    if not isinstance(rewards, list) or not rewards:
        raise ValueError("format")
    return {"code": parts[0], "activation_limit": limit, "rewards": rewards}


@router.callback_query(AdminPromoCallback.filter(F.action == "create"))
async def on_create_prompt(
    query: CallbackQuery, callback_data: AdminPromoCallback, ctx: RequestContext, state: FSMContext
) -> None:
    if not await require_permission(query, ctx, "promo"):
        return
    await state.set_state(AdminPromoStates.waiting_for_create)
    if query.message is not None:
        await query.message.answer(t("admin_promo_create_prompt", ctx.language))
    await query.answer()


@router.message(AdminPromoStates.waiting_for_create)
async def on_create_data(message: Message, ctx: RequestContext, state: FSMContext) -> None:
    try:
        fields = parse_promo_create(message.text or "")
    except (ValueError, TypeError, json.JSONDecodeError) as exc:
        raise AppError(t("admin_format_invalid", ctx.language)) from exc

    repo = PromoCodeRepository(ctx.session)
    if await repo.get_by_code(fields["code"]) is not None:
        raise AppError(t("admin_promo_code_taken", ctx.language))

    promo = await repo.create(**fields, created_by=ctx.user.id)
    await state.clear()

    await message.answer(
        t("admin_promo_created", ctx.language, code=promo.code) + "\n\n"
        + render_promo_admin_card(promo, ctx.language),
        reply_markup=admin_promo_card_keyboard(ctx.language, promo),
    )
