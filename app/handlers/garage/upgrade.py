"""Кнопка '➕ Увеличить гараж': подтверждение с ценой, затем покупка."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.types import CallbackQuery
from aiogram.utils.keyboard import InlineKeyboardBuilder

from app.callbacks.garage import GaragePageCallback, GarageUpgradeCallback
from app.core.context import RequestContext
from app.services.garage.upgrades import GarageUpgradeService

router = Router(name="garage_upgrade")


def _fmt(n: int) -> str:
    return f"{n:,}".replace(",", " ")


@router.callback_query(GarageUpgradeCallback.filter(F.action == "buy"))
async def on_garage_upgrade(
    query: CallbackQuery, callback_data: GarageUpgradeCallback, ctx: RequestContext
) -> None:
    tier = await GarageUpgradeService(ctx.session).get_next_tier_or_none(ctx.user)
    if tier is None:
        await query.answer("🏠 Гараж уже максимального размера.", show_alert=True)
        return

    text = (
        "🏠 <b>Расширение гаража</b>\n\n"
        f"📦 Новая вместимость: <b>{tier.new_capacity}</b> слотов\n"
        f"💰 Цена: <b>${_fmt(tier.price)}</b>\n"
        f"💳 Ваш баланс: ${_fmt(ctx.user.balance)}"
    )
    if ctx.user.balance < tier.price:
        text += f"\n\nⓘ Не хватает ${_fmt(tier.price - ctx.user.balance)}"

    b = InlineKeyboardBuilder()
    if ctx.user.balance >= tier.price:
        b.button(text="✅ Купить", callback_data=GarageUpgradeCallback(action="confirm"))
    b.button(text="❌ Отмена", callback_data=GarageUpgradeCallback(action="cancel"))
    b.adjust(2)

    await query.answer()
    if query.message is not None:
        await query.message.edit_text(text, reply_markup=b.as_markup(), parse_mode="HTML")


@router.callback_query(GarageUpgradeCallback.filter(F.action == "confirm"))
async def on_garage_upgrade_confirm(
    query: CallbackQuery, callback_data: GarageUpgradeCallback, ctx: RequestContext
) -> None:
    new_capacity = await GarageUpgradeService(ctx.session).upgrade(ctx.user)
    await query.answer(f"✅ Гараж увеличен до {new_capacity} слотов!", show_alert=True)
    if query.message is not None:
        await query.message.edit_text(
            f"✅ Гараж расширен до <b>{new_capacity}</b> слотов.\n"
            f"💳 Баланс: ${_fmt(ctx.user.balance)}\n\nОткрой «🚗 Гараж», чтобы посмотреть.",
            parse_mode="HTML",
        )


@router.callback_query(GarageUpgradeCallback.filter(F.action == "cancel"))
async def on_garage_upgrade_cancel(
    query: CallbackQuery, callback_data: GarageUpgradeCallback, ctx: RequestContext
) -> None:
    await query.answer("Отменено")
    if query.message is not None:
        await query.message.delete()
