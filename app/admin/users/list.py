"""Список игроков: страницы по 15, фильтры, поиск."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.filters.callback_data import CallbackData
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery
from aiogram.utils.keyboard import InlineKeyboardBuilder
from sqlalchemy import func, select

from app.admin.permissions import require_permission
from app.callbacks.admin import AdminMenuCallback, AdminUserCallback
from app.core.context import RequestContext
from app.models.user import User
from app.states.admin_users import AdminUserStates

router = Router(name="admin_users_list")
PAGE = 15
FILTERS = {"all": "Все", "vip": "👑 VIP", "ban": "🚫 Бан", "rich": "💰 Топ"}


class UsrCb(CallbackData, prefix="ausr"):
    a: str
    p: int = 1
    f: str = "all"


def _fmt(n: int) -> str:
    return f"{n:,}".replace(",", " ")


async def _render(ctx: RequestContext, p: int, f: str):
    cond = []
    if f == "vip":
        cond.append(User.is_vip.is_(True))
    elif f == "ban":
        cond.append(User.is_banned.is_(True))
    total = (await ctx.session.execute(select(func.count()).select_from(User).where(*cond))).scalar_one()
    pages = max((total + PAGE - 1) // PAGE, 1)
    p = max(1, min(p, pages))
    order = User.balance.desc() if f == "rich" else User.last_seen_at.desc().nulls_last()
    users = list((await ctx.session.execute(
        select(User).where(*cond).order_by(order, User.id).limit(PAGE).offset((p - 1) * PAGE))).scalars())
    b = InlineKeyboardBuilder()
    for k, title in FILTERS.items():
        b.button(text=("• " if k == f else "") + title, callback_data=UsrCb(a="page", p=1, f=k))
    for u in users:
        name = f"@{u.username}" if u.username else (u.first_name or str(u.id))
        mark = ("👑" if u.is_vip else "") + ("🚫" if u.is_banned else "")
        b.button(text=f"{mark} {name} · ${_fmt(u.balance)}".strip()[:60],
                 callback_data=AdminUserCallback(user_id=u.id, action="view"))
    nav = 0
    if p > 1:
        b.button(text="◀️", callback_data=UsrCb(a="page", p=p - 1, f=f)); nav += 1
    b.button(text=f"{p}/{pages}", callback_data=UsrCb(a="page", p=p, f=f)); nav += 1
    if p < pages:
        b.button(text="▶️", callback_data=UsrCb(a="page", p=p + 1, f=f)); nav += 1
    b.button(text="🔍 Поиск", callback_data=UsrCb(a="search"))
    b.button(text="◀️ В меню", callback_data=AdminMenuCallback(section="main"))
    b.adjust(4, *([1] * len(users)), nav, 1, 1)
    text = f"👥 <b>Игроки</b> · {FILTERS[f]} · {total}\nСтраница {p}/{pages}"
    return text, b.as_markup()


@router.callback_query(AdminMenuCallback.filter(F.section == "users"))
async def on_open(query: CallbackQuery, callback_data: AdminMenuCallback, ctx: RequestContext, state: FSMContext) -> None:
    if not await require_permission(query, ctx, "users"):
        return
    await state.clear()
    text, kb = await _render(ctx, 1, "all")
    if query.message is not None:
        await query.message.edit_text(text, reply_markup=kb, parse_mode="HTML")
    await query.answer()


@router.callback_query(UsrCb.filter())
async def on_cb(query: CallbackQuery, callback_data: UsrCb, ctx: RequestContext, state: FSMContext) -> None:
    if not await require_permission(query, ctx, "users") or query.message is None:
        return
    await query.answer()
    if callback_data.a == "search":
        await state.set_state(AdminUserStates.waiting_for_search)
        await query.message.answer("🔍 Пришли ID, @username или часть имени")
        return
    text, kb = await _render(ctx, callback_data.p, callback_data.f)
    await query.message.edit_text(text, reply_markup=kb, parse_mode="HTML")
