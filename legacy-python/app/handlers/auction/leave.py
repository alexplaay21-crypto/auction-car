"""🚪 Выйти из комнаты — inline-кнопка (только в ЛС, раздел 9 ТЗ)."""
from __future__ import annotations

from aiogram import Router
from aiogram.types import CallbackQuery

from app.callbacks.auction import RoomLeaveCallback
from app.core.context import RequestContext
from app.localization.manager import t
from app.services.rooms.membership import RoomMembershipService

router = Router(name="auction_leave")


@router.callback_query(RoomLeaveCallback.filter())
async def on_leave_room(
    query: CallbackQuery, callback_data: RoomLeaveCallback, ctx: RequestContext
) -> None:
    await RoomMembershipService(ctx.session).leave_room(ctx.user.id, callback_data.room_id)
    if query.message is not None:
        await query.message.edit_text(t("left_room", ctx.language))
    await query.answer()
