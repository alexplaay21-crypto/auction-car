"""Раздел 'Статистика' (раздел 27 ТЗ): сводка по игре за период."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.exceptions import TelegramBadRequest
from aiogram.types import CallbackQuery

from app.admin.permissions import require_permission
from app.callbacks.admin import AdminMenuCallback, AdminStatsCallback
from app.core.context import RequestContext
from app.keyboards.admin import admin_stats_keyboard
from app.localization.manager import t
from app.services.statistics.service import PERIODS, StatisticsService

router = Router(name="admin_statistics")


def _n(value: int) -> str:
    return f"{value:,}".replace(",", " ")


def _money(value: int) -> str:
    return f"${_n(value)}"


async def render_stats(ctx: RequestContext, period: str) -> str:
    report = await StatisticsService(ctx.session).build(period)
    return t(
        "admin_stats_text", ctx.language,
        period=t(f"admin_stats_period_{period}", ctx.language),
        players=_n(report.players), active=_n(report.active), new=_n(report.new),
        vip=_n(report.vip), banned=_n(report.banned),
        containers=_n(report.containers), bets=_n(report.bets), wins=_n(report.wins),
        cars=_n(report.cars), cars_sold=_n(report.cars_sold),
        player_sales=_n(report.player_sales),
        purchases=_n(report.purchases), purchases_sum=_money(report.purchases_sum),
        issued=_money(report.money_issued), spent=_money(report.money_spent),
        commissions=_money(report.commissions),
        referrals=_n(report.referrals), bp=_n(report.bp_buyers),
        promo=_n(report.promo_activations), errors=_n(report.errors),
        groups=_n(report.groups), broadcasts=_n(report.broadcasts),
    )


async def _show(query: CallbackQuery, ctx: RequestContext, period: str) -> None:
    text = await render_stats(ctx, period)
    if query.message is not None:
        try:
            await query.message.edit_text(text, reply_markup=admin_stats_keyboard(ctx.language, period))
        except TelegramBadRequest:
            pass  # «message is not modified» при повторном нажатии на тот же период
    await query.answer()


@router.callback_query(AdminMenuCallback.filter(F.section == "statistics"))
async def on_open_statistics(
    query: CallbackQuery, callback_data: AdminMenuCallback, ctx: RequestContext
) -> None:
    if not await require_permission(query, ctx, "statistics"):
        return
    await _show(query, ctx, "day")


@router.callback_query(AdminStatsCallback.filter(F.period.in_(set(PERIODS))))
async def on_change_period(
    query: CallbackQuery, callback_data: AdminStatsCallback, ctx: RequestContext
) -> None:
    if not await require_permission(query, ctx, "statistics"):
        return
    await _show(query, ctx, callback_data.period)
