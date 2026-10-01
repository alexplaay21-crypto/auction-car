"""Поиск игрока по Telegram ID или username (раздел 27 ТЗ)."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.callbacks.admin import AdminMenuCallback, AdminUserCallback
from app.core.context import RequestContext
from app.keyboards.admin import admin_user_card_keyboard
from app.admin.permissions import require_permission
from app.admin.users.profile import render_profile_card
from app.localization.manager import t
from app.repositories.user import UserRepository
from app.states.admin_users import AdminUserStates

router = Router(name="admin_users_search")

MAX_SEARCH_RESULTS = 10


@router.callback_query(AdminMenuCallback.filter(F.section == "users"))
async def on_open_users_section(
    query: CallbackQuery, callback_data: AdminMenuCallback, ctx: RequestContext, state: FSMContext
) -> None:
    if not await require_permission(query, ctx, "users"):
        return
    await state.set_state(AdminUserStates.waiting_for_search)
    if query.message is not None:
        await query.message.edit_text(t("admin_users_search_prompt", ctx.language))
    await query.answer()


@router.message(AdminUserStates.waiting_for_search)
async def on_search_query(message: Message, ctx: RequestContext, state: FSMContext) -> None:
    await state.clear()
    query_text = (message.text or "").strip()
    if not query_text:
        await message.answer(t("admin_users_not_found", ctx.language))
        return

    users = await UserRepository(ctx.session).search(query_text)

    if not users:
        await message.answer(t("admin_users_not_found", ctx.language))
        return

    if len(users) == 1:
        user = users[0]
        text = await render_profile_card(ctx, user)
        await message.answer(text, reply_markup=admin_user_card_keyboard(ctx.language, user))
        return

    from aiogram.utils.keyboard import InlineKeyboardBuilder

    builder = InlineKeyboardBuilder()
    for user in users[:MAX_SEARCH_RESULTS]:
        label = f"@{user.username}" if user.username else (user.first_name or str(user.id))
        builder.button(
            text=f"{label} ({user.id})",
            callback_data=AdminUserCallback(user_id=user.id, action="view"),
        )
    builder.adjust(1)
    await message.answer(t("admin_users_multiple_matches", ctx.language), reply_markup=builder.as_markup())
