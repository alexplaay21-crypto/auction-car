"""Статистика игрока в игровом стиле."""
from __future__ import annotations

from html import escape

from aiogram import F, Router
from aiogram.types import CallbackQuery

from app.callbacks.profile import ProfileCallback
from app.core.context import RequestContext
from app.handlers.settings.main import SettingsCallback
from app.repositories.user import UserStatsRepository
from aiogram.utils.keyboard import InlineKeyboardBuilder

router = Router(name="profile_statistics")

_RANKS = (
    (0, "🥉 Новичок"),
    (10, "🥈 Любитель"),
    (50, "🥇 Профи"),
    (150, "💎 Мастер"),
    (500, "👑 Легенда"),
)


def _fmt(n: int) -> str:
    return f"{n:,}".replace(",", " ")


def _rank(opened: int) -> str:
    title = _RANKS[0][1]
    for need, name in _RANKS:
        if opened >= need:
            title = name
    return title


@router.callback_query(ProfileCallback.filter(F.action == "statistics"))
async def on_statistics(
    query: CallbackQuery, callback_data: ProfileCallback, ctx: RequestContext
) -> None:
    s = await UserStatsRepository(ctx.session).get_or_create(ctx.user.id)
    user = ctx.user
    name = escape(user.first_name or (f"@{user.username}" if user.username else str(user.id)))
    winrate = int(100 * s.wins / s.bids_made) if s.bids_made else 0
    profit_sign = "📈" if s.container_profit >= 0 else "📉"

    text = (
        f'📊 <b>Статистика</b> · <a href="tg://user?id={user.id}">{name}</a>\n'
        f"{_rank(s.containers_opened)}\n\n"
        "🔥 <b>АУКЦИОНЫ</b>\n"
        f"├ 🎯 Ставок: <b>{_fmt(s.bids_made)}</b>\n"
        f"├ 🏆 Побед: <b>{_fmt(s.wins)}</b>\n"
        f"└ ⚡ Винрейт: <b>{winrate}%</b>\n\n"
        "📦 <b>КОЛЛЕКЦИЯ</b>\n"
        f"├ 📦 Открыто контейнеров: <b>{_fmt(s.containers_opened)}</b>\n"
        f"├ 🚗 Получено машин: <b>{_fmt(s.cars_obtained)}</b>\n"
        f"└ 💸 Продано машин: <b>{_fmt(s.cars_sold)}</b>\n\n"
        "💰 <b>ФИНАНСЫ</b>\n"
        f"├ 💵 Заработано: <b>${_fmt(s.earned_total)}</b>\n"
        f"├ 💳 Потрачено: <b>${_fmt(s.spent_total)}</b>\n"
        f"└ {profit_sign} Профит контейнеров: <b>${_fmt(s.container_profit)}</b>\n\n"
        f"👥 Приглашено друзей: <b>{_fmt(s.referrals_count)}</b>"
    )

    b = InlineKeyboardBuilder()
    b.button(text="◀️ Назад", callback_data=SettingsCallback(action="back"))

    await query.answer()
    if query.message is not None:
        await query.message.edit_text(text, reply_markup=b.as_markup(), parse_mode="HTML")
