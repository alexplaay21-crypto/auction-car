"""/start — точка входа. В ЛС запускает онбординг (язык → документация →
согласие → главное меню) или сразу показывает главное меню, если игрок уже
подтвердил документацию. В группе — короткое приветствие/подсказка уйти в ЛС.

Также разбирает реферальный deep-link (/start ref_<inviter_id>, раздел 21
ТЗ) — регистрация засчитывается один раз при первом /start приглашённого."""
from __future__ import annotations

from aiogram import Router
from aiogram.filters import CommandObject, CommandStart
from aiogram.types import Message

from app.core.context import RequestContext
from app.filters.group import IsGroupChat
from app.filters.private import IsPrivateChat
from app.keyboards.common import language_keyboard
from app.keyboards.main_menu import main_menu_keyboard
from app.localization.manager import t
from app.services.referrals.service import ReferralService, parse_inviter_id

router = Router(name="common_start")


@router.message(CommandStart(), IsPrivateChat())
async def cmd_start_private(message: Message, ctx: RequestContext, command: CommandObject) -> None:
    inviter_id = parse_inviter_id(command.args)
    if inviter_id is not None:
        await ReferralService(ctx.session).register_referral(inviter_id, ctx.user)

    if not ctx.user.agreed_to_docs:
        await message.answer(
            t("choose_language", ctx.language),
            reply_markup=language_keyboard(context="onboarding"),
        )
        return

    await message.answer(
        t("main_menu_title", ctx.language),
        reply_markup=main_menu_keyboard(ctx.language),
    )


@router.message(CommandStart(), IsGroupChat())
async def cmd_start_group(message: Message, ctx: RequestContext) -> None:
    key = "start_private_required" if not ctx.user.agreed_to_docs else "start_group_greeting"
    await message.answer(t(key, ctx.language))
