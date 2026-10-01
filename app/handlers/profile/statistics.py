"""Детальная статистика игрока (раздел 17 ТЗ) — доступна кнопкой из профиля."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.types import CallbackQuery

from app.callbacks.profile import ProfileCallback
from app.core.context import RequestContext
from app.localization.manager import t
from app.repositories.user import UserStatsRepository

router = Router(name="profile_statistics")


@router.callback_query(ProfileCallback.filter(F.action == "statistics"))
async def on_statistics(
    query: CallbackQuery, callback_data: ProfileCallback, ctx: RequestContext
) -> None:
    stats = await UserStatsRepository(ctx.session).get_or_create(ctx.user.id)

    lines = [
        t("stats_title", ctx.language),
        t("stats_containers_opened", ctx.language, value=stats.containers_opened),
        t("stats_bids_made", ctx.language, value=stats.bids_made),
        t("stats_wins", ctx.language, value=stats.wins),
        t("stats_cars_obtained", ctx.language, value=stats.cars_obtained),
        t("stats_cars_sold", ctx.language, value=stats.cars_sold),
        t("stats_earned_total", ctx.language, value=stats.earned_total),
        t("stats_spent_total", ctx.language, value=stats.spent_total),
        t("stats_container_profit", ctx.language, value=stats.container_profit),
        t("stats_referrals_count", ctx.language, value=stats.referrals_count),
    ]

    if query.message is not None:
        await query.message.answer("\n".join(lines))
    await query.answer()
