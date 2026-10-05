"""Ссылки на документацию и помощь (показываются в Настройках)."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.filters.callback_data import CallbackData
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message
from aiogram.utils.keyboard import InlineKeyboardBuilder

from app.admin.permissions import require_permission
from app.callbacks.admin import AdminMenuCallback
from app.core.context import RequestContext
from app.core.exceptions import AppError
from app.repositories.settings import SettingsRepository

router = Router(name="admin_docs_links")
NAMES = {"docs": "📖 Документация", "help": "❓ Помощь"}


class LinkCallback(CallbackData, prefix="alink"):
    action: str  # set | clear
    kind: str    # docs | help


class LinkStates(StatesGroup):
    waiting = State()


async def _render(ctx: RequestContext):
    repo = SettingsRepository(ctx.session)
    lines = ["📖 <b>Ссылки для игроков</b>", ""]
    b = InlineKeyboardBuilder()
    for kind, title in NAMES.items():
        url = await repo.get_value(f"{kind}_url", "")
        lines.append(f"{title}: {url if url else '— не задана'}")
        b.button(text=f"✏️ {title}", callback_data=LinkCallback(action="set", kind=kind))
        if url:
            b.button(text="🗑", callback_data=LinkCallback(action="clear", kind=kind))
    b.adjust(2)
    return "\n".join(lines), b.as_markup()


@router.callback_query(AdminMenuCallback.filter(F.section == "documentation"))
async def on_open(query: CallbackQuery, callback_data: AdminMenuCallback, ctx: RequestContext, state: FSMContext) -> None:
    if not await require_permission(query, ctx, "documentation"):
        return
    await state.clear()
    text, kb = await _render(ctx)
    if query.message is not None:
        await query.message.edit_text(text, reply_markup=kb, parse_mode="HTML", disable_web_page_preview=True)
    await query.answer()


@router.callback_query(LinkCallback.filter())
async def on_link(query: CallbackQuery, callback_data: LinkCallback, ctx: RequestContext, state: FSMContext) -> None:
    if not await require_permission(query, ctx, "documentation"):
        return
    if callback_data.action == "clear":
        await SettingsRepository(ctx.session).set_value(f"{callback_data.kind}_url", "", ctx.user.id)
        await ctx.session.commit()
        text, kb = await _render(ctx)
        if query.message is not None:
            await query.message.edit_text(text, reply_markup=kb, parse_mode="HTML", disable_web_page_preview=True)
        await query.answer("Убрано")
        return
    await state.set_state(LinkStates.waiting)
    await state.update_data(link_kind=callback_data.kind)
    if query.message is not None:
        await query.message.answer(f"Пришли ссылку (https://...) для «{NAMES[callback_data.kind]}»")
    await query.answer()


@router.message(LinkStates.waiting)
async def on_url(message: Message, ctx: RequestContext, state: FSMContext) -> None:
    url = (message.text or "").strip()
    if not url.startswith("https://"):
        raise AppError("Ссылка должна начинаться с https://")
    kind = (await state.get_data()).get("link_kind", "docs")
    await state.clear()
    await SettingsRepository(ctx.session).set_value(f"{kind}_url", url, ctx.user.id)
    await ctx.session.commit()
    text, kb = await _render(ctx)
    await message.answer("✅ Сохранено\n\n" + text, reply_markup=kb, parse_mode="HTML", disable_web_page_preview=True)
