"""/vip (вип/випка | vip/v) — статус и покупка VIP (раздел 19 ТЗ)."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.types import CallbackQuery, Message

from app.callbacks.vip import VipCallback
from app.core.context import RequestContext
from app.filters.command_alias import CommandAlias
from app.keyboards.vip import vip_purchase_keyboard
from app.localization.manager import t
from app.services.vip.service import VipService

router = Router(name="vip_main")

ALIASES = ("vip", "v", "вип", "випка")


@router.message(CommandAlias(*ALIASES))
async def cmd_vip(message: Message, ctx: RequestContext, command_args: str) -> None:
    if ctx.user.is_vip:
        await message.answer(t("vip_already_owned", ctx.language))
        return

    price = await VipService(ctx.session).get_price()
    await message.answer(
        t("vip_offer", ctx.language, price=price),
        reply_markup=vip_purchase_keyboard(ctx.language),
    )


@router.callback_query(VipCallback.filter(F.action == "buy"))
async def on_vip_buy(query: CallbackQuery, callback_data: VipCallback, ctx: RequestContext) -> None:
    await VipService(ctx.session).purchase(ctx.user)
    if query.message is not None:
        await query.message.edit_text(t("vip_purchase_success", ctx.language))
    await query.answer()
