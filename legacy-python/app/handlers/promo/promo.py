"""Промокод (разделы 24-25 ТЗ): команда с алиасами promo/промокод —
можно сразу с кодом одним сообщением, либо без аргумента (тогда бот
спрашивает код следующим сообщением через FSM). Тот же вход будет
доступен из Настроек → Промокод, когда появится полноценный экран
настроек — оба пути ведут в один и тот же _apply()."""
from __future__ import annotations

from aiogram import Router
from aiogram.fsm.context import FSMContext
from aiogram.types import Message

from app.core.context import RequestContext
from app.core.exceptions import AppError
from app.filters.command_alias import CommandAlias
from app.localization.manager import t
from app.services.promo.service import PromoService
from app.services.containers.auto_open import auto_open_and_notify
from app.states.promo import PromoStates

router = Router(name="promo_main")

ALIASES = ("promo", "промокод")


async def _apply(message: Message, ctx: RequestContext, code: str) -> None:
    await PromoService(ctx.session).redeem(ctx.user, code)
    await auto_open_and_notify(message.bot, ctx.session, ctx.user, message.chat.id)
    await message.answer(t("promo_success", ctx.language))


@router.message(CommandAlias(*ALIASES))
async def cmd_promo(
    message: Message, ctx: RequestContext, state: FSMContext, command_args: str
) -> None:
    code = command_args.strip()
    if code:
        await _apply(message, ctx, code)
        return

    await state.set_state(PromoStates.waiting_for_code)
    await message.answer(t("promo_prompt", ctx.language))


@router.message(PromoStates.waiting_for_code)
async def on_promo_code_entered(message: Message, ctx: RequestContext, state: FSMContext) -> None:
    await state.clear()
    code = (message.text or "").strip()
    if not code:
        raise AppError(t("promo_invalid", ctx.language))
    await _apply(message, ctx, code)
