"""🆘 Поддержка: отчёт игрока (мин. 5 слов) -> владельцу, награду выбирает владелец."""
from __future__ import annotations

from html import escape

from aiogram import F, Router
from aiogram.filters.callback_data import CallbackData
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message
from aiogram.utils.keyboard import InlineKeyboardBuilder

from app.config.settings import settings
from app.core.context import RequestContext
from app.database.transaction import atomic
from app.repositories.user import UserRepository

router = Router(name="settings_support")

MIN_WORDS = 5
REWARDS = {"s": 5_000, "m": 25_000, "h": 100_000, "n": 0}


class SupportStates(StatesGroup):
    waiting_text = State()


class SupportCallback(CallbackData, prefix="sup"):
    action: str  # start | cancel | rew
    tier: str = "-"
    uid: int = 0


def _fmt(n: int) -> str:
    return f"{n:,}".replace(",", " ")


@router.callback_query(SupportCallback.filter(F.action == "start"))
async def on_start(query: CallbackQuery, state: FSMContext) -> None:
    await query.answer()
    await state.set_state(SupportStates.waiting_text)
    b = InlineKeyboardBuilder()
    b.button(text="❌ Отмена", callback_data=SupportCallback(action="cancel"))
    if query.message is not None:
        await query.message.answer(
            "🆘 <b>ПОДДЕРЖКА</b>\n\nНашёл баг или есть идея?\n"
            f"Напиши минимум {MIN_WORDS} слов, и получи награду!",
            reply_markup=b.as_markup(),
            parse_mode="HTML",
        )


@router.callback_query(SupportCallback.filter(F.action == "cancel"))
async def on_cancel(query: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    await query.answer("Отменено")
    if query.message is not None:
        await query.message.delete()


@router.message(SupportStates.waiting_text)
async def on_report(message: Message, ctx: RequestContext, state: FSMContext) -> None:
    text = (message.text or "").strip()
    if len(text.split()) < MIN_WORDS:
        await message.answer(f"✍️ Нужно минимум {MIN_WORDS} слов. Опиши подробнее.")
        return
    await state.clear()

    user = ctx.user
    name = escape(user.first_name or (f"@{user.username}" if user.username else str(user.id)))
    b = InlineKeyboardBuilder()
    b.button(text="🟢 $5 000", callback_data=SupportCallback(action="rew", tier="s", uid=user.id))
    b.button(text="🟡 $25 000", callback_data=SupportCallback(action="rew", tier="m", uid=user.id))
    b.button(text="🔴 $100 000", callback_data=SupportCallback(action="rew", tier="h", uid=user.id))
    b.button(text="❌ Без награды", callback_data=SupportCallback(action="rew", tier="n", uid=user.id))
    b.adjust(3, 1)

    report = (
        "🆘 <b>Новый отчёт</b>\n"
        f'👤 <a href="tg://user?id={user.id}">{name}</a> · <code>{user.id}</code>\n\n'
        f"{escape(text)}"
    )
    await message.bot.send_message(settings.owner_id, report, reply_markup=b.as_markup(), parse_mode="HTML")
    await message.answer("✅ <b>Отчёт принят!</b> Награда придёт после проверки.", parse_mode="HTML")


@router.callback_query(SupportCallback.filter(F.action == "rew"))
async def on_reward(query: CallbackQuery, callback_data: SupportCallback, ctx: RequestContext) -> None:
    if query.from_user.id != settings.owner_id:
        await query.answer("Нет доступа", show_alert=True)
        return
    if query.message is None:
        return
    original = query.message.html_text or ""
    await query.message.edit_reply_markup(reply_markup=None)  # защита от двойного нажатия

    amount = REWARDS.get(callback_data.tier, 0)
    if amount:
        async with atomic(ctx.session):
            await UserRepository(ctx.session).increment_balance(callback_data.uid, amount)
        note = f"🎁 Спасибо за отчёт! Награда: <b>${_fmt(amount)}</b>"
    else:
        note = "🙏 Спасибо за отчёт! В этот раз без награды."
    try:
        await query.bot.send_message(callback_data.uid, note, parse_mode="HTML")
    except Exception:
        pass

    await query.answer("Готово")
    label = f"${_fmt(amount)}" if amount else "без награды"
    await query.message.edit_text(original + f"\n\n✅ Выдано: {label}", parse_mode="HTML")
