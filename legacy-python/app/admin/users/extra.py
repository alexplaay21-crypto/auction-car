"""Карточка игрока: меню баланса, быстрые суммы, точный баланс, сообщение игроку, сброс бонуса."""
from __future__ import annotations

from html import escape

from aiogram import F, Router
from aiogram.exceptions import TelegramBadRequest
from aiogram.filters.callback_data import CallbackData
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message
from aiogram.utils.keyboard import InlineKeyboardBuilder
from sqlalchemy import text

from app.admin.permissions import require_permission
from app.admin.users.profile import render_profile_card
from app.callbacks.admin import AdminUserCallback
from app.core.context import RequestContext
from app.core.enums import TransactionType
from app.core.exceptions import AppError
from app.database.transaction import atomic, distributed_lock, new_operation_id
from app.keyboards.admin import admin_user_card_keyboard
from app.repositories.history import record_event
from app.repositories.transaction import TransactionRepository
from app.repositories.user import UserRepository

router = Router(name="admin_users_extra")
NOCMD = ~F.text.startswith("/")


class QbCb(CallbackData, prefix="aqb"):
    u: int
    m: str = "d"   # d — прибавить delta, s — задать точное значение
    d: int = 0


class XS(StatesGroup):
    exact = State()
    msg = State()


def _fmt(n: int) -> str:
    return f"{n:,}".replace(",", " ")


def _name(u) -> str:
    return f"@{u.username}" if u.username else (u.first_name or str(u.id))


async def _apply(ctx: RequestContext, uid: int, delta: int | None = None, exact: int | None = None):
    async with distributed_lock(f"admin_balance:{uid}"):
        async with atomic(ctx.session):
            repo = UserRepository(ctx.session)
            user = await repo.get(uid)
            if user is None:
                raise AppError("Игрок не найден")
            new = exact if exact is not None else user.balance + delta
            if new < 0:
                raise AppError("Баланс не может быть меньше 0")
            diff = new - user.balance
            if diff != 0:
                new_balance = await repo.increment_balance(uid, diff)
                record_event(ctx.session, uid, "admin_balance",
                             {"delta": diff, "balance_after": new_balance}, actor_admin_id=ctx.user.id)
                await TransactionRepository(ctx.session).create(
                    user_id=uid, type_=TransactionType.ADMIN_ADJUST, amount=diff,
                    balance_after=new_balance, operation_id=new_operation_id(),
                    description=f"admin_adjust_by_{ctx.user.id}")
    user = await UserRepository(ctx.session).get(uid)
    await ctx.session.refresh(user)
    return user


async def _menu(msg: Message, ctx: RequestContext, uid: int, edit: bool = True):
    user = await UserRepository(ctx.session).get(uid)
    if user is None:
        raise AppError("Игрок не найден")
    b = InlineKeyboardBuilder()
    for d in (1000, 10000, 100000):
        b.button(text=f"➕ {_fmt(d)}", callback_data=QbCb(u=uid, d=d))
    for d in (1000, 10000, 100000):
        b.button(text=f"➖ {_fmt(d)}", callback_data=QbCb(u=uid, d=-d))
    b.button(text="🎯 Установить", callback_data=QbCb(u=uid, m="s"))
    b.button(text="✏️ Своё (+/−)", callback_data=AdminUserCallback(user_id=uid, action="balance_prompt"))
    b.button(text="◀️ К карточке", callback_data=AdminUserCallback(user_id=uid, action="refresh"))
    b.adjust(3, 3, 2, 1)
    txt = f"💰 <b>Баланс</b> · {escape(_name(user))}\n\nСейчас: <b>${_fmt(user.balance)}</b>"
    if edit:
        try:
            await msg.edit_text(txt, reply_markup=b.as_markup(), parse_mode="HTML")
        except TelegramBadRequest:
            pass
    else:
        await msg.answer(txt, reply_markup=b.as_markup(), parse_mode="HTML")


async def _card(msg: Message, ctx: RequestContext, uid: int, notice: str = "") -> None:
    user = await UserRepository(ctx.session).get(uid)
    if user is None:
        await msg.answer("Игрок не найден")
        return
    await ctx.session.refresh(user)
    body = await render_profile_card(ctx, user)
    await msg.answer((notice + "\n\n" if notice else "") + body,
                     reply_markup=admin_user_card_keyboard(ctx.language, user))


@router.callback_query(AdminUserCallback.filter(F.action == "bal_menu"))
async def on_bal_menu(query: CallbackQuery, callback_data: AdminUserCallback, ctx: RequestContext) -> None:
    if not await require_permission(query, ctx, "users"):
        return
    if query.message is not None:
        await _menu(query.message, ctx, callback_data.user_id)
    await query.answer()


@router.callback_query(QbCb.filter())
async def on_qb(query: CallbackQuery, callback_data: QbCb, ctx: RequestContext, state: FSMContext) -> None:
    if not await require_permission(query, ctx, "users") or query.message is None:
        return
    if callback_data.m == "s":
        await state.set_state(XS.exact)
        await state.update_data(uid=callback_data.u)
        await query.message.answer("🎯 Какой баланс установить? (число, 0 и больше)")
        await query.answer()
        return
    await _apply(ctx, callback_data.u, delta=callback_data.d)
    await _menu(query.message, ctx, callback_data.u)
    await query.answer(f"✅ {callback_data.d:+,}".replace(",", " "))


@router.message(XS.exact, F.text, NOCMD)
async def on_exact(message: Message, ctx: RequestContext, state: FSMContext) -> None:
    raw = (message.text or "").strip().replace(" ", "")
    if not raw.isdigit():
        raise AppError("Нужно целое число от 0")
    uid = (await state.get_data()).get("uid")
    await state.clear()
    await _apply(ctx, uid, exact=int(raw))
    await _menu(message, ctx, uid, edit=False)


@router.callback_query(AdminUserCallback.filter(F.action == "refresh"))
async def on_refresh(query: CallbackQuery, callback_data: AdminUserCallback, ctx: RequestContext) -> None:
    if not await require_permission(query, ctx, "users"):
        return
    user = await UserRepository(ctx.session).get(callback_data.user_id)
    if user is None or query.message is None:
        await query.answer("Не найден", show_alert=True)
        return
    await ctx.session.refresh(user)
    try:
        await query.message.edit_text(await render_profile_card(ctx, user),
                                      reply_markup=admin_user_card_keyboard(ctx.language, user))
    except TelegramBadRequest:
        pass
    await query.answer("🔄")


@router.callback_query(AdminUserCallback.filter(F.action == "msg"))
async def on_msg_prompt(query: CallbackQuery, callback_data: AdminUserCallback,
                        ctx: RequestContext, state: FSMContext) -> None:
    if not await require_permission(query, ctx, "users"):
        return
    await state.set_state(XS.msg)
    await state.update_data(uid=callback_data.user_id)
    if query.message is not None:
        await query.message.answer("✉️ Текст сообщения игроку:")
    await query.answer()


@router.message(XS.msg, F.text, NOCMD)
async def on_msg(message: Message, ctx: RequestContext, state: FSMContext) -> None:
    uid = (await state.get_data()).get("uid")
    await state.clear()
    try:
        await message.bot.send_message(uid, "📩 <b>Сообщение от администрации</b>\n\n" + escape(message.text or ""),
                                       parse_mode="HTML")
        notice = "✅ Отправлено"
        async with atomic(ctx.session):
            record_event(ctx.session, uid, "admin_message", {"len": len(message.text or "")},
                         actor_admin_id=ctx.user.id)
    except Exception:
        notice = "ⓘ Не доставлено (игрок не запускал бота или заблокировал его)"
    await _card(message, ctx, uid, notice)


@router.callback_query(AdminUserCallback.filter(F.action == "reset_bonus"))
async def on_reset_bonus(query: CallbackQuery, callback_data: AdminUserCallback, ctx: RequestContext) -> None:
    if not await require_permission(query, ctx, "users"):
        return
    uid = callback_data.user_id
    async with atomic(ctx.session):
        await ctx.session.execute(text("UPDATE users SET last_daily_bonus_date = NULL WHERE id=:i"), {"i": uid})
        record_event(ctx.session, uid, "admin_reset_bonus", {}, actor_admin_id=ctx.user.id)
    await query.answer("🎁 Ежедневный бонус сброшен", show_alert=True)
