"""Раздел 'Промокоды': список и карточка (raздел 24 ТЗ)."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery

from app.admin.permissions import require_permission
from app.callbacks.admin import AdminMenuCallback, AdminPromoCallback
from app.core.context import RequestContext
from app.core.enums import Language
from app.keyboards.admin import admin_promo_card_keyboard, admin_promo_list_keyboard
from app.localization.manager import t
from app.models.promo_code import PromoCode
from app.repositories.promo import PromoCodeRepository

router = Router(name="admin_promo_list")


def render_promo_admin_card(promo: PromoCode, language: Language) -> str:
    lines = [
        f"🎟 {promo.code} (ID {promo.id})",
        t("admin_promo_activations_line", language,
          used=promo.activations_count, limit=promo.activation_limit or "∞"),
        t("admin_promo_expires_line", language, expires=promo.expires_at or "—"),
        f"rewards: {promo.rewards}",
    ]
    if not promo.is_active:
        lines.append(t("admin_promo_disabled_label", language))
    return "\n".join(lines)


@router.callback_query(AdminMenuCallback.filter(F.section == "promo"))
async def on_open_promo_section(
    query: CallbackQuery, callback_data: AdminMenuCallback, ctx: RequestContext, state: FSMContext
) -> None:
    if not await require_permission(query, ctx, "promo"):
        return
    await state.clear()
    promos = await PromoCodeRepository(ctx.session).list_all()
    title = t("admin_promo_title", ctx.language) if promos else t("admin_promo_empty", ctx.language)
    if query.message is not None:
        await query.message.edit_text(title, reply_markup=admin_promo_list_keyboard(ctx.language, promos))
    await query.answer()


@router.callback_query(AdminPromoCallback.filter(F.action == "view"))
async def on_view_promo(query: CallbackQuery, callback_data: AdminPromoCallback, ctx: RequestContext) -> None:
    if not await require_permission(query, ctx, "promo"):
        return
    promo = await PromoCodeRepository(ctx.session).get(callback_data.promo_id)
    if promo is None:
        await query.answer(t("error_not_found", ctx.language), show_alert=True)
        return
    if query.message is not None:
        await query.message.edit_text(
            render_promo_admin_card(promo, ctx.language), reply_markup=admin_promo_card_keyboard(ctx.language, promo)
        )
    await query.answer()
