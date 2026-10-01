"""Кнопка '🎁 Ежедневный бонус' в профиле."""
from __future__ import annotations

import datetime as dt

from aiogram import F, Router
from aiogram.types import CallbackQuery

from app.callbacks.profile import ProfileCallback
from app.core.context import RequestContext
from app.localization.manager import t
from app.services.profile.service import ProfileService

router = Router(name="profile_daily_bonus")


@router.callback_query(ProfileCallback.filter(F.action == "daily_bonus"))
async def on_daily_bonus(
    query: CallbackQuery, callback_data: ProfileCallback, ctx: RequestContext
) -> None:
    now = dt.datetime.now(dt.timezone.utc)
    amount = await ProfileService(ctx.session).claim_daily_bonus(ctx.user, now)
    await query.answer(t("daily_bonus_claimed", ctx.language, amount=amount), show_alert=True)
