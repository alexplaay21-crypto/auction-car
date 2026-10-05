"""👤 Профиль — баланс, VIP, количество машин, кнопка ежедневного бонуса."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.types import Message

from app.core.context import RequestContext
from app.filters.private import IsPrivateChat
from app.keyboards.main_menu import menu_text_variants
from app.keyboards.profile import profile_keyboard
from app.localization.manager import t
from app.services.profile.service import ProfileService
from app.utils.usernames import format_mention

router = Router(name="profile_main")


@router.message(F.text.in_(menu_text_variants("menu_profile")), IsPrivateChat())
async def show_profile(message: Message, ctx: RequestContext) -> None:
    cars_count = await ProfileService(ctx.session).get_cars_count(ctx.user.id)

    from html import escape
    user = ctx.user
    name = escape(user.first_name or (f"@{user.username}" if user.username else str(user.id)))
    vip = "👑 " if user.is_vip else ""
    lines = [
        f'{vip}<a href="tg://user?id={user.id}">{name}</a>',
        f"💰 Баланс: {user.balance}$",
        f"🚗 Машин: {cars_count}",
    ]
    await message.answer(
        "\n".join(lines), reply_markup=profile_keyboard(ctx.language), parse_mode="HTML"
    )
