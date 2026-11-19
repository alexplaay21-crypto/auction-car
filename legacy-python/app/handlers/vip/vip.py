"""/vip: преимущества с точными цифрами; покупка только лотом магазина за Stars."""
from __future__ import annotations

from aiogram import Router
from aiogram.types import Message
from aiogram.utils.keyboard import InlineKeyboardBuilder

from app.callbacks.shop import ShopCallback
from app.core.context import RequestContext
from app.core.enums import RewardType
from app.filters.command_alias import CommandAlias
from app.repositories.settings import SettingsRepository
from app.repositories.shop import ShopLotItemRepository
from app.services.economy.commissions import DEFAULT_COMMISSIONS
from app.services.garage.upgrades import DEFAULT_VIP_BONUS_SLOTS
from app.services.shop.service import ShopService

router = Router(name="vip_main")

ALIASES = ("vip", "v", "вип", "випка")
ROWS = (
    ("commission_quick_sell", "⚡ Быстрая продажа"),
    ("commission_sell_state", "🏛 Продажа государству"),
    ("commission_sell_player", "🤝 Продажа игроку"),
    ("commission_transfer", "💳 Перевод денег"),
)


def _pct(x: float) -> str:
    return f"{round(float(x) * 100, 2):g}%"


@router.message(CommandAlias(*ALIASES))
async def cmd_vip(message: Message, ctx: RequestContext, command_args: str) -> None:
    repo = SettingsRepository(ctx.session)
    slots = await repo.get_value("garage_vip_bonus_slots", DEFAULT_VIP_BONUS_SLOTS)

    lines = ["👑 <b>VIP навсегда</b>", "", "💸 <b>Комиссии</b> (обычный → VIP)"]
    for key, title in ROWS:
        r = await repo.get_value(key, DEFAULT_COMMISSIONS[key])
        lines.append(f"{title}: {_pct(r['regular'])} → <b>{_pct(r['vip'])}</b>")
    lines += [
        "",
        f"🏠 Гараж: <b>+{slots}</b> мест",
        "👑 Значок перед ником везде",
    ]

    if ctx.user.is_vip:
        lines += ["", "✅ <b>VIP у тебя уже есть!</b>"]
        await message.answer("\n".join(lines), parse_mode="HTML")
        return

    vip_lot = None
    for lot in await ShopService(ctx.session).list_available():
        items = await ShopLotItemRepository(ctx.session).list_for_lot(lot.id)
        if any(i.item_type is RewardType.VIP for i in items):
            vip_lot = lot
            break

    kb = None
    if vip_lot:
        lines += ["", f"⭐ Цена: <b>{vip_lot.price} Stars</b>"]
        b = InlineKeyboardBuilder()
        b.button(text=f"⭐ Купить VIP · {vip_lot.price}", callback_data=ShopCallback(lot_id=vip_lot.id))
        kb = b.as_markup()
    else:
        lines += ["", "⭐ VIP скоро появится в магазине."]
    await message.answer("\n".join(lines), reply_markup=kb, parse_mode="HTML")
