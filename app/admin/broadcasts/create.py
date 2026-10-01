"""Создание рассылки (раздел 25 ТЗ): текст/фото/видео/документ/GIF/voice/
sticker + опциональные inline-кнопки (URL), аудитория и расписание —
шаги мастера. Сама отправка — services нет, это делает фоновая задача
tasks/broadcast_tasks.py, здесь только сбор параметров и запись строки
Broadcast."""
from __future__ import annotations

import datetime as dt
import json

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.admin.permissions import require_permission
from app.callbacks.admin import (
    AdminBroadcastAudienceCallback,
    AdminBroadcastCallback,
    AdminBroadcastScheduleCallback,
)
from app.core.context import RequestContext
from app.core.enums import BroadcastAudience, BroadcastContentType, BroadcastSchedule, BroadcastStatus
from app.core.exceptions import AppError
from app.keyboards.admin import admin_broadcast_audience_keyboard, admin_broadcast_schedule_keyboard
from app.localization.manager import t
from app.repositories.broadcast import BroadcastRepository
from app.states.admin_broadcasts import AdminBroadcastStates

router = Router(name="admin_broadcasts_create")

_CONTENT_MAP: tuple[tuple[str, BroadcastContentType], ...] = (
    ("photo", BroadcastContentType.PHOTO),
    ("video", BroadcastContentType.VIDEO),
    ("document", BroadcastContentType.DOCUMENT),
    ("animation", BroadcastContentType.ANIMATION),
    ("voice", BroadcastContentType.VOICE),
    ("sticker", BroadcastContentType.STICKER),
)


def detect_content(message: Message) -> tuple[BroadcastContentType, str | None, str | None]:
    """Возвращает (тип, media_file_id, текст/подпись)."""
    if message.photo:
        return BroadcastContentType.PHOTO, message.photo[-1].file_id, message.caption
    if message.video:
        return BroadcastContentType.VIDEO, message.video.file_id, message.caption
    if message.document:
        return BroadcastContentType.DOCUMENT, message.document.file_id, message.caption
    if message.animation:
        return BroadcastContentType.ANIMATION, message.animation.file_id, message.caption
    if message.voice:
        return BroadcastContentType.VOICE, message.voice.file_id, message.caption
    if message.sticker:
        return BroadcastContentType.STICKER, message.sticker.file_id, None
    if message.text:
        return BroadcastContentType.TEXT, None, message.text
    raise ValueError("unsupported_content")


@router.callback_query(AdminBroadcastCallback.filter(F.action == "create"))
async def on_create_prompt(
    query: CallbackQuery, callback_data: AdminBroadcastCallback, ctx: RequestContext, state: FSMContext
) -> None:
    if not await require_permission(query, ctx, "broadcasts"):
        return
    await state.set_state(AdminBroadcastStates.waiting_for_content)
    if query.message is not None:
        await query.message.answer(t("admin_bc_content_prompt", ctx.language))
    await query.answer()


@router.message(AdminBroadcastStates.waiting_for_content)
async def on_content(message: Message, ctx: RequestContext, state: FSMContext) -> None:
    try:
        content_type, media_file_id, text = detect_content(message)
    except ValueError as exc:
        raise AppError(t("admin_bc_content_invalid", ctx.language)) from exc

    await state.update_data(
        admin_bc_content_type=content_type.value, admin_bc_media_file_id=media_file_id, admin_bc_text=text,
    )
    await state.set_state(AdminBroadcastStates.waiting_for_buttons)
    await message.answer(t("admin_bc_buttons_prompt", ctx.language))


@router.message(AdminBroadcastStates.waiting_for_buttons)
async def on_buttons(message: Message, ctx: RequestContext, state: FSMContext) -> None:
    raw = (message.text or "").strip()
    buttons = None
    if raw != "-":
        try:
            buttons = json.loads(raw)
            if not isinstance(buttons, list):
                raise ValueError("format")
        except (ValueError, TypeError, json.JSONDecodeError) as exc:
            raise AppError(t("admin_bc_buttons_invalid", ctx.language)) from exc

    await state.update_data(admin_bc_buttons=buttons)
    await message.answer(t("admin_bc_audience_prompt", ctx.language), reply_markup=admin_broadcast_audience_keyboard(ctx.language))


@router.callback_query(AdminBroadcastAudienceCallback.filter())
async def on_audience_chosen(
    query: CallbackQuery, callback_data: AdminBroadcastAudienceCallback, ctx: RequestContext, state: FSMContext
) -> None:
    await state.update_data(admin_bc_audience=callback_data.audience)
    if query.message is not None:
        await query.message.edit_text(
            t("admin_bc_schedule_prompt", ctx.language), reply_markup=admin_broadcast_schedule_keyboard(ctx.language)
        )
    await query.answer()


@router.callback_query(AdminBroadcastScheduleCallback.filter())
async def on_schedule_chosen(
    query: CallbackQuery, callback_data: AdminBroadcastScheduleCallback, ctx: RequestContext, state: FSMContext
) -> None:
    data = await state.get_data()
    await state.clear()

    required = ("admin_bc_content_type", "admin_bc_audience")
    if any(key not in data for key in required):
        await query.answer(t("error_generic", ctx.language), show_alert=True)
        return

    schedule_map = {
        "now": BroadcastSchedule.ONCE, "daily": BroadcastSchedule.DAILY, "weekly": BroadcastSchedule.WEEKLY,
    }
    schedule_type = schedule_map[callback_data.schedule_type]
    now = dt.datetime.now(dt.timezone.utc)

    broadcast = await BroadcastRepository(ctx.session).create(
        created_by=ctx.user.id,
        content_type=BroadcastContentType(data["admin_bc_content_type"]),
        text=data.get("admin_bc_text"),
        media_file_id=data.get("admin_bc_media_file_id"),
        buttons=data.get("admin_bc_buttons"),
        audience=BroadcastAudience(data["admin_bc_audience"]),
        schedule_type=schedule_type,
        scheduled_at=now,
        status=BroadcastStatus.SCHEDULED,
    )
    await ctx.session.flush()

    if query.message is not None:
        await query.message.edit_text(t("admin_bc_created", ctx.language, broadcast_id=broadcast.id))
    await query.answer()
