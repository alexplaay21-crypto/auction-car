"""🎫 БП: уровни, прогресс, получение наград, покупка за Telegram Stars."""
from __future__ import annotations

import datetime as dt

from aiogram import F, Router
from aiogram.types import CallbackQuery, LabeledPrice, Message

from app.callbacks.battle_pass import BattlePassCallback
from app.core.context import RequestContext
from app.keyboards.battle_pass import battle_pass_keyboard
from app.keyboards.main_menu import menu_text_variants
from app.localization.manager import t
from app.models.car import Car
from app.repositories.battle_pass import BattlePassLevelRepository, BattlePassRewardRepository
from app.services.battle_pass.service import BattlePassService
from app.services.containers.auto_open import auto_open_and_notify
from app.utils.dates import current_game_day, time_left_parts

router = Router(name="battle_pass_main")


def _fmt(n: int) -> str:
    return f"{n:,}".replace(",", " ")


def _bar(cur: int, total: int) -> str:
    filled = round(10 * cur / total) if total else 0
    return "▰" * filled + "▱" * (10 - filled)


async def _reward_text(ctx: RequestContext, reward):
    rtype = getattr(reward.reward_type, "value", reward.reward_type)
    p = reward.payload or {}
    if rtype == "money":
        return f"💰 ${_fmt(int(p.get('amount', 0)))}", None
    if rtype == "car":
        car = await ctx.session.get(Car, int(p.get("car_id", 0)))
        return (f"🚗 {car.name}" if car else "🚗 Машина"), car
    if rtype == "container":
        return "📦 Контейнер", None
    if rtype == "vip":
        return "👑 VIP", None
    return "🎁 Награда", None


async def _build(ctx: RequestContext):
    service = BattlePassService(ctx.session)
    bp = await service.get_active()
    if bp is None:
        return t("bp_not_purchased", ctx.language), None, None

    progress = await service.get_progress(ctx.user.id, bp.id)
    purchased = progress is not None and progress.purchased_at is not None
    cur = progress.current_level if purchased else 0
    claimed = progress.claimed_level if purchased else 0
    total = bp.levels_count

    level_repo = BattlePassLevelRepository(ctx.session)
    reward_repo = BattlePassRewardRepository(ctx.session)
    rows, photo = [], None
    for n in range(1, total + 1):
        level = await level_repo.get_by_number(bp.id, n)
        rewards = await reward_repo.list_for_level(level.id) if level else []
        parts = []
        for r in rewards:
            text, car = await _reward_text(ctx, r)
            parts.append(text)
            if car is not None and car.photo_file_id:
                photo = car.photo_file_id  # главный приз = машина с самого высокого уровня
        rows.append((n, " + ".join(parts) or "—"))

    now = dt.datetime.now(dt.timezone.utc)
    lines = [f"🎫 <b>Battle Pass · {bp.name}</b>", ""]
    if purchased:
        lines.append(f"🏆 Уровень: <b>{cur}/{total}</b>")
        lines.append(f"{_bar(cur, total)} {int(100 * cur / total) if total else 0}%")
        if cur >= total:
            lines.append("🎉 Все уровни пройдены!")
        elif progress.last_level_up_date == current_game_day(now):
            left = time_left_parts(now)
            lines.append(f"⏳ Следующий уровень через: {left['hours']} ч {left['minutes']} мин")
        else:
            lines.append("🔥 Открой любой контейнер сегодня — получишь новый уровень!")
    else:
        lines.append("🔒 Battle Pass не куплен")
        lines.append("1 уровень в день за открытый контейнер. Награды:")
    lines.append("")
    for n, reward_str in rows:
        if purchased and n <= claimed:
            icon = "✅"
        elif purchased and n <= cur:
            icon = "🎁"
        elif purchased and n == cur + 1:
            icon = "🎯"
        else:
            icon = "🔒"
        lines.append(f"{icon} <b>{n}</b> · {reward_str}")

    kb = battle_pass_keyboard(
        price=None if purchased else bp.price,
        claimable=max(cur - claimed, 0) if purchased else 0,
    )
    return "\n".join(lines), photo, kb


async def _send(message: Message, ctx: RequestContext) -> None:
    text, photo, kb = await _build(ctx)
    if photo:
        await message.answer_photo(photo, caption=text, reply_markup=kb)
    else:
        await message.answer(text, reply_markup=kb)


@router.message(F.text.in_(menu_text_variants("menu_battle_pass")))
async def show_battle_pass(message: Message, ctx: RequestContext) -> None:
    await _send(message, ctx)


@router.callback_query(BattlePassCallback.filter(F.action == "claim"))
async def on_claim(query: CallbackQuery, callback_data: BattlePassCallback, ctx: RequestContext) -> None:
    await BattlePassService(ctx.session).claim_rewards(ctx.user)
    if query.message is not None:
        await auto_open_and_notify(query.bot, ctx.session, ctx.user, query.message.chat.id)
    await query.answer("🎁 Награды получены!", show_alert=True)
    if query.message is not None:
        await query.message.delete()
        await _send(query.message, ctx)


@router.callback_query(BattlePassCallback.filter(F.action == "buy"))
async def on_buy(query: CallbackQuery, callback_data: BattlePassCallback, ctx: RequestContext) -> None:
    bp = await BattlePassService(ctx.session).get_active()
    await query.answer()
    if bp is None or query.message is None:
        return
    await query.message.answer_invoice(
        title=f"Battle Pass · {bp.name}",
        description=f"{bp.levels_count} уровней наград",
        payload=f"bp:{bp.id}",
        currency="XTR",
        prices=[LabeledPrice(label=bp.name, amount=bp.price)],
        provider_token="",
    )
