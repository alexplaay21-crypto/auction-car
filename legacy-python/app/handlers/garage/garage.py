"""🚗 Гараж / /inventory (инвентарь, инв, гараж | inventory, inv) — список
машин игрока с пагинацией. В группе — без кнопки расширения (раздел 12 ТЗ)."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.types import CallbackQuery, Message

from app.callbacks.garage import GaragePageCallback
from app.core.context import RequestContext
from app.core.enums import Rarity
from app.filters.command_alias import CommandAlias
from app.keyboards.garage import garage_keyboard
from app.keyboards.main_menu import menu_text_variants
from app.localization.manager import t
from app.services.garage.service import GarageService
from app.utils.pagination import Page

router = Router(name="garage_main")

ALIASES = ("inventory", "inv", "инвентарь", "инв", "гараж")

_RARITY_ICON = {
    Rarity.COMMON: "⚪",
    Rarity.RARE: "🔵",
    Rarity.EPIC: "🟣",
    Rarity.MYTHIC: "🟡",
}

_RARITY_LABEL_KEYS = {
    Rarity.COMMON: "rarity_common",
    Rarity.RARE: "rarity_rare",
    Rarity.EPIC: "rarity_epic",
    Rarity.MYTHIC: "rarity_mythic",
}


async def _render(ctx: RequestContext, page: int) -> tuple[str, Page]:
    service = GarageService(ctx.session)
    garage = await service.get_or_create_garage(ctx.user.id)
    page_obj = await service.get_cars_page(ctx.user.id, page)

    from html import escape
    user = ctx.user
    name = escape(user.first_name or (f"@{user.username}" if user.username else str(user.id)))
    vip = "👑 " if user.is_vip else ""
    lines = [
        f'🏁 <b>Гараж</b> {vip}<a href="tg://user?id={user.id}">{name}</a>',
        f"🏠 Слотов: {page_obj.total}/{garage.capacity}",
        "",
    ]
    if not page_obj.items:
        lines.append(t("garage_empty", ctx.language))
    else:
        for user_car, car in page_obj.items:
            rarity_label = t(_RARITY_LABEL_KEYS[car.rarity], ctx.language)
            price = f"{car.price:,}".replace(",", " ")
            lines.append(f"🚗 <b>{car.name}</b>")
            lines.append(f"{rarity_label} · 💰 ${price} · <code>/car {car.id:03d}</code>")
            lines.append("")
        lines.append(t("garage_hint", ctx.language))
    return "\n".join(lines), page_obj


@router.message(F.text.in_(menu_text_variants("menu_garage")))
@router.message(CommandAlias(*ALIASES))
async def show_garage(message: Message, ctx: RequestContext, command_args: str | None = None) -> None:
    text, page_obj = await _render(ctx, page=1)
    is_group = message.chat.type in ("group", "supergroup")
    await message.answer(
        text, reply_markup=garage_keyboard(ctx.language, page_obj, show_upgrade=not is_group)
    )


@router.callback_query(GaragePageCallback.filter())
async def on_garage_page(
    query: CallbackQuery, callback_data: GaragePageCallback, ctx: RequestContext
) -> None:
    text, page_obj = await _render(ctx, page=callback_data.page)
    is_group = query.message is not None and query.message.chat.type in ("group", "supergroup")
    if query.message is not None:
        await query.message.edit_text(
            text, reply_markup=garage_keyboard(ctx.language, page_obj, show_upgrade=not is_group)
        )
    await query.answer()
