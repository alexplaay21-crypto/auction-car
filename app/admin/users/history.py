"""Полная история игрока в карточке админки (раздел 27 ТЗ): ставки,
выигрыши, машины, продажи, покупки, переводы, рефералы, бонусы, промокоды,
BP, VIP, действия администраторов и другие изменения аккаунта. Постранично,
новые сверху; у каждого события дата/время и ID операции (если есть)."""
from __future__ import annotations

from aiogram import Router
from aiogram.exceptions import TelegramBadRequest
from aiogram.types import CallbackQuery

from app.admin.permissions import require_permission
from app.callbacks.admin import AdminHistoryCallback
from app.core.context import RequestContext
from app.keyboards.admin import admin_history_keyboard
from app.localization.manager import t
from app.repositories.user import UserRepository
from app.services.history.service import PAGE_SIZE, HistoryService
from app.utils.usernames import format_mention

router = Router(name="admin_users_history")


@router.callback_query(AdminHistoryCallback.filter())
async def on_history(
    query: CallbackQuery, callback_data: AdminHistoryCallback, ctx: RequestContext
) -> None:
    if not await require_permission(query, ctx, "users"):
        return
    user = await UserRepository(ctx.session).get(callback_data.user_id)
    if user is None:
        await query.answer(t("error_not_found", ctx.language), show_alert=True)
        return

    page = max(callback_data.page, 0)
    body, total, has_next = await HistoryService(ctx.session).page(user.id, page, ctx.language)
    pages = max((total + PAGE_SIZE - 1) // PAGE_SIZE, 1)
    text = t(
        "admin_history_title", ctx.language,
        user=format_mention(user), page=page + 1, pages=pages, total=total,
    ) + "\n\n" + body

    if query.message is not None:
        try:
            await query.message.edit_text(
                text, reply_markup=admin_history_keyboard(ctx.language, user.id, page, has_next)
            )
        except TelegramBadRequest:
            pass
    await query.answer()
