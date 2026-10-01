"""Назначение администратора — только владелец бота. Владелец присылает ID
или username игрока, бот выдаёт полный набор прав (ADMIN_PERMISSION_KEYS).
Точечная настройка прав по разделам — за пределами этой части ТЗ, права
можно скорректировать позже вручную в БД или в будущей доработке."""
from __future__ import annotations

import datetime as dt

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.admin.admins.list import render_admins
from app.callbacks.admin import AdminAdminsCallback
from app.core.context import RequestContext
from app.core.exceptions import AppError
from app.keyboards.admin import admin_admins_list_keyboard
from app.localization.manager import t
from app.models.admin import ADMIN_PERMISSION_KEYS
from app.repositories.user import AdminRepository, UserRepository
from app.states.admin_admins import AdminAdminsStates

router = Router(name="admin_admins_add")


@router.callback_query(AdminAdminsCallback.filter(F.action == "add"))
async def on_add_prompt(
    query: CallbackQuery, callback_data: AdminAdminsCallback, ctx: RequestContext, state: FSMContext
) -> None:
    if not ctx.is_owner:
        await query.answer(t("admin_owner_only", ctx.language), show_alert=True)
        return
    await state.set_state(AdminAdminsStates.waiting_for_add_search)
    if query.message is not None:
        await query.message.answer(t("admin_admins_add_prompt", ctx.language))
    await query.answer()


@router.message(AdminAdminsStates.waiting_for_add_search)
async def on_add_search(message: Message, ctx: RequestContext, state: FSMContext) -> None:
    await state.clear()
    query_text = (message.text or "").strip()
    users = await UserRepository(ctx.session).search(query_text)
    if not users:
        raise AppError(t("admin_users_not_found", ctx.language))

    target = users[0]
    permissions = {key: True for key in ADMIN_PERMISSION_KEYS}
    await AdminRepository(ctx.session).upsert(
        target.id, permissions, ctx.user.id, dt.datetime.now(dt.timezone.utc)
    )

    text, rows = await render_admins(ctx)
    await message.answer(
        t("admin_admins_added", ctx.language) + "\n\n" + text,
        reply_markup=admin_admins_list_keyboard(ctx.language, rows),
    )
