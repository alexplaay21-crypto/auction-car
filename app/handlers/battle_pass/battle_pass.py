"""🎫 БП — статус, покупка, прогресс уровня (раздел 22 ТЗ)."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.types import CallbackQuery, Message

from app.callbacks.battle_pass import BattlePassCallback
from app.core.context import RequestContext
from app.keyboards.battle_pass import battle_pass_keyboard
from app.keyboards.main_menu import menu_text_variants
from app.localization.manager import t
from app.services.battle_pass.service import BattlePassService

router = Router(name="battle_pass_main")


async def _render(ctx: RequestContext) -> tuple[str, bool]:
    """Возвращает (текст, нужно_ли_показать_кнопку_покупки)."""
    service = BattlePassService(ctx.session)
    bp = await service.get_active()
    if bp is None:
        return t("bp_not_purchased", ctx.language), False

    progress = await service.get_progress(ctx.user.id, bp.id)
    if progress is None or progress.purchased_at is None:
        return t("bp_offer", ctx.language, price=bp.price, levels=bp.levels_count), True

    text = t("bp_title", ctx.language) + "\n" + t(
        "bp_level_progress", ctx.language, level=progress.current_level, max_level=bp.levels_count
    )
    return text, False


@router.message(F.text.in_(menu_text_variants("menu_battle_pass")))
async def show_battle_pass(message: Message, ctx: RequestContext) -> None:
    text, show_buy_button = await _render(ctx)
    if show_buy_button:
        await message.answer(text, reply_markup=battle_pass_keyboard(ctx.language))
    else:
        await message.answer(text)


@router.callback_query(BattlePassCallback.filter(F.action == "buy"))
async def on_battle_pass_buy(
    query: CallbackQuery, callback_data: BattlePassCallback, ctx: RequestContext
) -> None:
    await BattlePassService(ctx.session).purchase(ctx.user)
    if query.message is not None:
        await query.message.edit_text(t("bp_purchase_success", ctx.language))
    await query.answer()
