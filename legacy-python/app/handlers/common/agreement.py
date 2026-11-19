"""Подтверждение согласия с документацией (шаг 3 первого запуска). После
согласия — открывается главное меню (шаг 4), до согласия игровые функции
недоступны (это гарантирует UserMiddleware/будущие фильтры доступа —
здесь только сам переход)."""
from __future__ import annotations

import datetime as dt

from aiogram import F, Router
from aiogram.types import CallbackQuery

from app.callbacks.common import DocsCallback
from app.core.context import RequestContext
from app.keyboards.main_menu import main_menu_keyboard
from app.localization.manager import t
from app.repositories.user import UserRepository

router = Router(name="common_agreement")


@router.callback_query(DocsCallback.filter(F.action == "agree"))
async def on_docs_agree(query: CallbackQuery, callback_data: DocsCallback, ctx: RequestContext) -> None:
    now = dt.datetime.now(dt.timezone.utc)

    await UserRepository(ctx.session).set_agreed_to_docs(ctx.user.id, now)
    ctx.user.agreed_to_docs = True
    ctx.user.agreed_at = now

    if query.message is not None:
        await query.message.edit_text(t("agreement_accepted", ctx.language))
        await query.message.answer(
            t("main_menu_title", ctx.language),
            reply_markup=main_menu_keyboard(ctx.language),
        )

    await query.answer()
