"""/sellcar CAR_ID (продать/прод | sellcar/sc) — продажа государству.
/sell CAR_ID PLAYER PRICE (продать/прод | sell/s) — продажа игроку с
офером на принятие/отклонение.

RU-алиас «продать/прод» в ТЗ общий для обеих команд — различаем по
количеству аргументов (1 → государству, 3 → другому игроку)."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.types import CallbackQuery, Message

from app.callbacks.economy import SaleOfferCallback
from app.core.context import RequestContext
from app.core.exceptions import AppError
from app.filters.command_alias import CommandAlias
from app.keyboards.economy import sale_offer_keyboard
from app.localization.manager import t
from app.services.economy.transactions import EconomyService
from app.utils.usernames import format_mention

router = Router(name="economy_sales")

ALIASES = ("sellcar", "sc", "sell", "s", "продать", "прод")


@router.message(CommandAlias(*ALIASES))
async def cmd_sell(message: Message, ctx: RequestContext, command_args: str) -> None:
    parts = command_args.split()
    service = EconomyService(ctx.session)

    if len(parts) == 1 and parts[0].isdigit():
        amount = await service.sell_to_state(ctx.user, int(parts[0]))
        await message.answer(t("sell_state_success", ctx.language, amount=amount))
        return

    if len(parts) == 3 and parts[0].isdigit() and parts[2].isdigit():
        user_car_id, buyer_ref, price = int(parts[0]), parts[1], int(parts[2])
        sale, buyer, car = await service.offer_sell_to_player(ctx.user, user_car_id, buyer_ref, price)
        await message.answer(t("sell_player_offer_sent", ctx.language))

        try:
            await message.bot.send_message(
                buyer.id,
                t("sell_player_offer_received", buyer.language, car_name=car.name, price=price),
                reply_markup=sale_offer_keyboard(buyer.language, sale.id),
            )
        except Exception:
            pass  # покупатель мог заблокировать бота — оферта остаётся в БД, он увидит её позже
        return

    raise AppError(t("sell_invalid_args", ctx.language))


@router.callback_query(SaleOfferCallback.filter(F.action == "accept"))
async def on_sale_accept(
    query: CallbackQuery, callback_data: SaleOfferCallback, ctx: RequestContext
) -> None:
    sale, car = await EconomyService(ctx.session).accept_sale_offer(ctx.user, callback_data.sale_id)
    if query.message is not None:
        await query.message.edit_text(t("sell_player_accepted", ctx.language))
    await query.answer()

    try:
        from app.repositories.user import UserRepository

        seller = await UserRepository(ctx.session).get(sale.seller_id)
        if seller is not None:
            await query.bot.send_message(
                seller.id,
                t("sell_player_accepted", seller.language) + f" ({format_mention(ctx.user)})",
            )
    except Exception:
        pass


@router.callback_query(SaleOfferCallback.filter(F.action == "decline"))
async def on_sale_decline(
    query: CallbackQuery, callback_data: SaleOfferCallback, ctx: RequestContext
) -> None:
    sale = await EconomyService(ctx.session).decline_sale_offer(ctx.user, callback_data.sale_id)
    if query.message is not None:
        await query.message.edit_text(t("sell_player_declined", ctx.language))
    await query.answer()

    try:
        from app.repositories.user import UserRepository

        seller = await UserRepository(ctx.session).get(sale.seller_id)
        if seller is not None:
            await query.bot.send_message(seller.id, t("sell_player_declined", seller.language))
    except Exception:
        pass
