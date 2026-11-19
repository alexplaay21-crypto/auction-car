"""Оплата Battle Pass в Telegram Stars."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.types import Message, PreCheckoutQuery

from app.core.context import RequestContext
from app.services.battle_pass.service import BattlePassService

router = Router(name="battle_pass_payment")


@router.pre_checkout_query(F.invoice_payload.startswith("bp:"))
async def on_pre_checkout(query: PreCheckoutQuery) -> None:
    await query.answer(ok=True)


@router.message(F.successful_payment.invoice_payload.startswith("bp:"))
async def on_paid(message: Message, ctx: RequestContext) -> None:
    bp_id = int(message.successful_payment.invoice_payload.split(":")[1])
    await BattlePassService(ctx.session).activate_paid(ctx.user.id, bp_id)
    await message.answer("✅ Battle Pass активирован! Открывай контейнеры и забирай награды в разделе 🎫 БП.")
