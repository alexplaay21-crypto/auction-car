"""/top (топ/рейтинг | top/rank) — в группе топ 15 участников этой группы
по балансу. 🏆 Лидерборд (ЛС) — три глобальных лидерборда: богатые,
гонщики (по победам), профит от контейнеров (раздел 20 ТЗ)."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.types import CallbackQuery, Message
from aiogram.utils.keyboard import InlineKeyboardBuilder

from app.callbacks.leaderboard import LeaderboardCallback

from app.core.context import RequestContext
from app.filters.command_alias import CommandAlias
from app.keyboards.main_menu import menu_text_variants
from app.localization.manager import t
from app.services.leaderboard.service import LeaderboardService
from app.utils.usernames import format_mention

router = Router(name="leaderboard_main")

ALIASES = ("top", "rank", "топ", "рейтинг")


def _rank_lines(entries: list, formatter) -> list[str]:
    if not entries:
        return []
    return [f"{i}. {formatter(entry)}" for i, entry in enumerate(entries, start=1)]


@router.message(CommandAlias(*ALIASES))
async def cmd_top_group(message: Message, ctx: RequestContext, command_args: str) -> None:
    if message.chat.type not in ("group", "supergroup"):
        return  # в ЛС используется кнопка меню «🏆 Лидерборд»

    users = await LeaderboardService(ctx.session).top_rich_group(message.chat.id)
    lines = [t("top_title_group", ctx.language)]
    rank_lines = _rank_lines(users, format_mention)
    lines += rank_lines if rank_lines else [t("leaderboard_empty", ctx.language)]
    await message.answer("\n".join(lines))


_KINDS = (("rich", "💰 Богатые"), ("racers", "🏁 Гонщики"), ("profit", "📦 Профит"))
_MEDALS = {1: "🥇", 2: "🥈", 3: "🥉"}


def _fmt(n: int) -> str:
    return f"{n:,}".replace(",", " ")


def _keyboard(active: str):
    b = InlineKeyboardBuilder()
    for kind, title in _KINDS:
        b.button(
            text=("✅ " if kind == active else "") + title,
            callback_data=LeaderboardCallback(kind=kind),
        )
    b.adjust(3)
    return b.as_markup()


async def _render(ctx: RequestContext, kind: str) -> str:
    service = LeaderboardService(ctx.session)
    if kind == "racers":
        title = "🏁 <b>Топ гонщиков</b> · по победам"
        rows = [(u, f"🏆 {st.wins}") for u, st in await service.top_racers_global()]
    elif kind == "profit":
        title = "📦 <b>Топ по профиту контейнеров</b>"
        rows = [(u, f"💰 ${_fmt(st.container_profit)}") for u, st in await service.top_container_profit_global()]
    else:
        title = "💰 <b>Топ богатых</b>"
        rows = [(u, f"💰 ${_fmt(u.balance)}") for u in await service.top_rich_global()]

    lines = [title, ""]
    if not rows:
        lines.append(t("leaderboard_empty", ctx.language))
    for i, (user, value) in enumerate(rows, start=1):
        lines.append(f"{_MEDALS.get(i, f'{i}.')} {format_mention(user)} — {value}")
    return "\n".join(lines)


@router.message(F.text.in_(menu_text_variants("menu_leaderboard")))
async def show_global_leaderboards(message: Message, ctx: RequestContext) -> None:
    await message.answer(await _render(ctx, "rich"), reply_markup=_keyboard("rich"), parse_mode="HTML")


@router.callback_query(LeaderboardCallback.filter())
async def on_leaderboard(query: CallbackQuery, callback_data: LeaderboardCallback, ctx: RequestContext) -> None:
    await query.answer()
    if query.message is not None:
        await query.message.edit_text(
            await _render(ctx, callback_data.kind),
            reply_markup=_keyboard(callback_data.kind),
            parse_mode="HTML",
        )
