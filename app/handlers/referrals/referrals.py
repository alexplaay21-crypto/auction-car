"""👥 Рефералы — реферальная ссылка, число приглашённых, прогресс до
эпической машины за 10 приглашений (раздел 21 ТЗ)."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.types import Message

from app.core.context import RequestContext
from app.keyboards.main_menu import menu_text_variants
from app.localization.manager import t
from app.repositories.referral import ReferralRepository
from app.repositories.user import UserRepository
from app.services.referrals.service import DEFAULT_EPIC_THRESHOLD, build_deep_link_payload
from app.utils.usernames import format_mention

router = Router(name="referrals_main")

_bot_username_cache: str | None = None


async def _bot_username(bot) -> str:
    global _bot_username_cache
    if _bot_username_cache is None:
        me = await bot.get_me()
        _bot_username_cache = me.username
    return _bot_username_cache


@router.message(F.text.in_(menu_text_variants("menu_referrals")))
async def show_referrals(message: Message, ctx: RequestContext) -> None:
    referral_repo = ReferralRepository(ctx.session)
    referrals = await referral_repo.list_for_inviter(ctx.user.id)
    count = len(referrals)

    username = await _bot_username(message.bot)
    link = f"https://t.me/{username}?start={build_deep_link_payload(ctx.user.id)}"

    progress = count % DEFAULT_EPIC_THRESHOLD

    lines = [
        t("referrals_title", ctx.language),
        link,
        "",
        t("referrals_invited_count", ctx.language, count=count),
        t("referrals_progress", ctx.language, progress=progress, threshold=DEFAULT_EPIC_THRESHOLD),
    ]

    if referrals:
        user_repo = UserRepository(ctx.session)
        lines.append("")
        for referral in referrals[:10]:
            invited_user = await user_repo.get(referral.invited_id)
            if invited_user is not None:
                lines.append(f"• {format_mention(invited_user)}")

    await message.answer("\n".join(lines))
