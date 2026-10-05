"""⬆️ Навыки: уровень, значение, улучшение одной кнопкой (×1 и ×10)."""
from __future__ import annotations
from app.utils.loc import loc

from aiogram import F, Router
from aiogram.types import CallbackQuery, Message
from aiogram.utils.keyboard import InlineKeyboardBuilder

from app.callbacks.skills import SkillCallback
from app.core.context import RequestContext
from app.core.exceptions import AppError
from app.database.transaction import atomic, distributed_lock
from app.keyboards.main_menu import menu_text_variants
from app.repositories.skill import SkillRepository, UserSkillRepository
from app.repositories.user import UserRepository

router = Router(name="skills")


def _fmt(n: int) -> str:
    return f"{n:,}".replace(",", " ")


MAX_SKILL_LEVEL = 400      # покупок
BUYS_PER_LEVEL = 4         # 4 покупки = 1 уровень на экране (макс. 100)
TOTAL_SKILL_COST = 20_000_000
BASE_PRICE = 1000
_K = (TOTAL_SKILL_COST - BASE_PRICE * MAX_SKILL_LEVEL) / sum(n ** 6 for n in range(1, MAX_SKILL_LEVEL + 1))


def skill_value(purchases: int) -> float:
    return 0.20 + 0.80 * max(1 - purchases / 180, 0) ** 4.5


def upgrade_price(next_level: int) -> int:
    return round(BASE_PRICE + _K * next_level ** 6)


def total_price(lvl: int, count: int) -> int:
    return sum(upgrade_price(lvl + i) for i in range(1, count + 1))


def _bar(cur: int, total: int) -> str:
    filled = round(10 * cur / total) if total else 0
    return "▰" * filled + "▱" * (10 - filled)


async def _level(ctx: RequestContext, skill_id: int) -> int:
    us = await UserSkillRepository(ctx.session).get_for_user(ctx.user.id, skill_id)
    return us.level if us else 0


def _render(skill, lvl: int, balance: int, lang="ru"):
    text = (
        f"⬆️ <b>{loc(skill, 'name', lang)}</b>\n"
        f"{loc(skill, 'description', lang) or ''}\n\n"
        f"🏆 Уровень: <b>{lvl // 4}/100</b>\n"
        f"{_bar(lvl // 4, 100)}\n"
        f"🏁 Сила гонщика: <b>{lvl // 4}</b>\n"
        f"💳 Баланс: ${_fmt(balance)}"
    )
    if lvl >= skill.max_level:
        return text + "\n\n🎉 Максимальный уровень!", None
    m = min(10, skill.max_level - lvl)
    text += (
        f"\n\n➡️ 🏁 {skill_value(lvl):.2f} → {skill_value(lvl + 1):.2f}"
        f" · ${_fmt(upgrade_price(lvl + 1))}"
    )
    if m >= 2:
        text += f"\n⏫ ×{m}: → {skill_value(lvl + m):.2f} · ${_fmt(total_price(lvl, m))}"
    b = InlineKeyboardBuilder()
    b.button(
        text=f"⬆️ Улучшить · ${_fmt(upgrade_price(lvl + 1))}",
        callback_data=SkillCallback(action="buy1", skill_id=skill.id),
    )
    n = min(10, skill.max_level - lvl)
    if n >= 2:
        b.button(
            text=f"⏫ ×{n} · ${_fmt(total_price(lvl, n))}",
            callback_data=SkillCallback(action="buy10", skill_id=skill.id),
        )
    b.adjust(1)
    return text, b.as_markup()


@router.message(F.text.in_(menu_text_variants("menu_skills")))
async def show_skills(message: Message, ctx: RequestContext) -> None:
    skills = await SkillRepository(ctx.session).list_all()
    if not skills:
        await message.answer("Навыков пока нет.")
        return
    for skill in skills:
        text, kb = _render(skill, await _level(ctx, skill.id), ctx.user.balance, ctx.language)
        await message.answer(text, reply_markup=kb, parse_mode="HTML")


@router.callback_query(SkillCallback.filter(F.action.in_({"up", "buy1", "buy10"})))
async def on_buy(query: CallbackQuery, callback_data: SkillCallback, ctx: RequestContext) -> None:
    skill = await SkillRepository(ctx.session).get(callback_data.skill_id)
    if skill is None:
        await query.answer("Навык не найден", show_alert=True)
        return
    async with distributed_lock(f"skill_up:{ctx.user.id}"):
        async with atomic(ctx.session):
            lvl = await _level(ctx, skill.id)
            if lvl >= skill.max_level:
                raise AppError("Максимальный уровень")
            count = 10 if callback_data.action == "buy10" else 1
            count = min(count, skill.max_level - lvl)
            price = total_price(lvl, count)
            repo = UserRepository(ctx.session)
            fresh = await repo.get(ctx.user.id)
            if fresh is None or fresh.balance < price:
                raise AppError("Недостаточно средств")
            new_balance = await repo.increment_balance(ctx.user.id, -price)
            await UserSkillRepository(ctx.session).upsert_level(ctx.user.id, skill.id, lvl + count)
    ctx.user.balance = new_balance
    text, kb = _render(skill, lvl + count, new_balance, ctx.language)
    await query.answer(f"✅ Уровень {lvl + count}")
    if query.message is not None:
        await query.message.edit_text(text, reply_markup=kb, parse_mode="HTML")


@router.callback_query(SkillCallback.filter(F.action.in_({"confirm", "cancel"})))
async def on_old(query: CallbackQuery, callback_data: SkillCallback, ctx: RequestContext) -> None:
    await query.answer("Откройте «⬆️ Навыки» заново")
