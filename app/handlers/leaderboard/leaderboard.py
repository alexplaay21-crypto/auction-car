"""/top (топ/рейтинг | top/rank) — в группе топ 15 участников этой группы
по балансу. 🏆 Лидерборд (ЛС) — три глобальных лидерборда: богатые,
гонщики (по победам), профит от контейнеров (раздел 20 ТЗ)."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.types import Message

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


@router.message(F.text.in_(menu_text_variants("menu_leaderboard")))
async def show_global_leaderboards(message: Message, ctx: RequestContext) -> None:
    service = LeaderboardService(ctx.session)

    rich = await service.top_rich_global()
    racers = await service.top_racers_global()
    profit = await service.top_container_profit_global()

    lines = [t("top_title_rich", ctx.language)]
    rank_lines = _rank_lines(rich, format_mention)
    lines += rank_lines if rank_lines else [t("leaderboard_empty", ctx.language)]

    lines += ["", t("top_title_racers", ctx.language)]
    rank_lines = _rank_lines(racers, lambda pair: f"{format_mention(pair[0])} — {pair[1].wins}")
    lines += rank_lines if rank_lines else [t("leaderboard_empty", ctx.language)]

    lines += ["", t("top_title_profit", ctx.language)]
    rank_lines = _rank_lines(profit, lambda pair: f"{format_mention(pair[0])} — {pair[1].container_profit}")
    lines += rank_lines if rank_lines else [t("leaderboard_empty", ctx.language)]

    await message.answer("\n".join(lines))
