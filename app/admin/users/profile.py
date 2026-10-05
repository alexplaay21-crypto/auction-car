"""Карточка игрока в админке: баланс, VIP, машины, статистика, статус
бана (раздел 27 ТЗ)."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.types import CallbackQuery

from app.callbacks.admin import AdminUserCallback
from app.core.context import RequestContext
from app.keyboards.admin import admin_user_card_keyboard
from app.localization.manager import t
from app.models.user import User
from app.repositories.garage import UserCarRepository
from app.repositories.referral import ReferralRepository
from app.repositories.user import UserRepository, UserStatsRepository
from app.utils.usernames import format_mention

router = Router(name="admin_users_profile")


async def render_profile_card(ctx: RequestContext, user: User) -> str:
    stats = await UserStatsRepository(ctx.session).get_or_create(user.id)
    cars_count = await UserCarRepository(ctx.session).count_owned(user.id)
    referrals_count = await ReferralRepository(ctx.session).count_for_inviter(user.id)

    lines = [
        format_mention(user),
        f"ID: {user.id}",
        t("profile_balance", ctx.language, balance=user.balance),
        t("profile_cars_count", ctx.language, count=cars_count),
        t("stats_containers_opened", ctx.language, value=stats.containers_opened),
        t("stats_wins", ctx.language, value=stats.wins),
        t("stats_referrals_count", ctx.language, value=referrals_count),
    ]
    def _d(x):
        return x.strftime("%d.%m.%Y %H:%M") if x else "—"
    lines.append(f"📅 Регистрация: {_d(getattr(user, 'created_at', None))}")
    lines.append(f"🕒 Был: {_d(user.last_seen_at)}")
    if user.referred_by:
        lines.append(f"🤝 Пригласил: {user.referred_by}")
    if user.is_vip:
        lines.append(t("profile_vip", ctx.language))
    if user.is_banned:
        lines.append(t("admin_user_banned_label", ctx.language))
        if user.ban_reason:
            lines.append(f"Причина: {user.ban_reason}")

    return "\n".join(lines)


@router.callback_query(AdminUserCallback.filter(F.action == "view"))
async def on_view_user(
    query: CallbackQuery, callback_data: AdminUserCallback, ctx: RequestContext
) -> None:
    user = await UserRepository(ctx.session).get(callback_data.user_id)
    if user is None:
        await query.answer(t("error_not_found", ctx.language), show_alert=True)
        return

    text = await render_profile_card(ctx, user)
    if query.message is not None:
        await query.message.edit_text(text, reply_markup=admin_user_card_keyboard(ctx.language, user))
    await query.answer()
