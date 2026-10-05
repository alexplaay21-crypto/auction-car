"""Кнопка «◀️ В меню»: возврат в главное меню админки из любого раздела."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery

from app.admin.menu import admin_menu_text
from app.callbacks.admin import AdminMenuCallback
from app.core.context import RequestContext
from app.keyboards.admin import admin_menu_keyboard

router = Router(name="admin_back")


@router.callback_query(AdminMenuCallback.filter(F.section == "main"))
async def on_main(query: CallbackQuery, callback_data: AdminMenuCallback, ctx: RequestContext, state: FSMContext) -> None:
    await state.clear()
    msg = query.message
    if msg is not None:
        try:
            await msg.edit_text(admin_menu_text(ctx.language), reply_markup=admin_menu_keyboard(ctx.language))
        except Exception:
            await msg.delete()
            await msg.answer(admin_menu_text(ctx.language), reply_markup=admin_menu_keyboard(ctx.language))
    await query.answer()
