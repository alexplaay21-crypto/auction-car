"""Включение/выключение промокода (is_active) — история активаций
(PromoRedemption) сохраняется."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.types import CallbackQuery

from app.admin.permissions import require_permission
from app.admin.promo.list import render_promo_admin_card
from app.callbacks.admin import AdminPromoCallback
from app.core.context import RequestContext
from app.keyboards.admin import admin_promo_card_keyboard
from app.localization.manager import t
from app.repositories.promo import PromoCodeRepository

router = Router(name="admin_promo_delete")


@router.callback_query(AdminPromoCallback.filter(F.action == "toggle"))
async def on_toggle_promo(query: CallbackQuery, callback_data: AdminPromoCallback, ctx: RequestContext) -> None:
    if not await require_permission(query, ctx, "promo"):
        return
    repo = PromoCodeRepository(ctx.session)
    promo = await repo.get(callback_data.promo_id)
    if promo is None:
        await query.answer(t("error_not_found", ctx.language), show_alert=True)
        return

    active = not promo.is_active
    await repo.set_active(promo.id, active)
    promo.is_active = active

    if query.message is not None:
        await query.message.edit_text(
            render_promo_admin_card(promo, ctx.language), reply_markup=admin_promo_card_keyboard(ctx.language, promo)
        )
    await query.answer(t("admin_action_done", ctx.language))
