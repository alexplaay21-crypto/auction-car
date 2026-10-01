"""/transfer PLAYER AMOUNT (перевод/дать | transfer/tr) — перевод денег
другому игроку (раздел 16 ТЗ)."""
from __future__ import annotations

from aiogram import Router
from aiogram.types import Message

from app.core.context import RequestContext
from app.core.exceptions import AppError
from app.filters.command_alias import CommandAlias
from app.localization.manager import t
from app.services.economy.transactions import EconomyService
from app.utils.usernames import format_mention

router = Router(name="economy_transfer")

ALIASES = ("transfer", "tr", "перевод", "дать")


@router.message(CommandAlias(*ALIASES))
async def cmd_transfer(message: Message, ctx: RequestContext, command_args: str) -> None:
    parts = command_args.split()
    if len(parts) != 2 or not parts[1].isdigit():
        raise AppError(t("transfer_invalid_args", ctx.language))

    recipient_ref, amount = parts[0], int(parts[1])
    net_amount, recipient = await EconomyService(ctx.session).transfer_money(
        ctx.user, recipient_ref, amount
    )
    await message.answer(t("transfer_success", ctx.language, amount=net_amount, target=format_mention(recipient)))
