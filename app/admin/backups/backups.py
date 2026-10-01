"""Раздел 'Резервные копии' (раздел 27 ТЗ): состояние, ручной запуск,
настройки (вкл/выкл, час UTC, число хранимых копий). Копии получает только
владелец бота — не администраторы."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.exceptions import TelegramBadRequest
from aiogram.types import CallbackQuery

from app.admin.permissions import require_permission
from app.callbacks.admin import AdminBackupCallback, AdminMenuCallback
from app.config.logging import get_logger
from app.core.context import RequestContext
from app.keyboards.admin import admin_backups_keyboard
from app.localization.manager import t
from app.services.backups.postgres import BackupError
from app.services.backups.service import (
    DEFAULTS, KEEP_MAX, KEEP_MIN, list_backups, load_config, run_backup, save_setting,
)

router = Router(name="admin_backups")
logger = get_logger(__name__)


async def _render(query: CallbackQuery, ctx: RequestContext) -> None:
    cfg = await load_config()
    files = list_backups(limit=5)
    last = cfg.last_run.strftime("%d.%m.%Y %H:%M UTC") if cfg.last_run else "—"
    state = t("admin_bkp_state_on" if cfg.enabled else "admin_bkp_state_off", ctx.language)
    text = t(
        "admin_bkp_text", ctx.language,
        state=state, hour=f"{cfg.hour_utc:02d}:00", keep=cfg.keep_count, last=last,
        files="\n".join(f"• {f.name} ({f.stat().st_size // 1024} KB)" for f in files) or "—",
    )
    if cfg.unsent:
        text += "\n\n" + t("admin_bkp_unsent", ctx.language, name=cfg.unsent)
    if query.message is not None:
        try:
            await query.message.edit_text(text, reply_markup=admin_backups_keyboard(ctx.language, cfg.enabled))
        except TelegramBadRequest:
            pass


@router.callback_query(AdminMenuCallback.filter(F.section == "backups"))
async def on_open_backups(query: CallbackQuery, callback_data: AdminMenuCallback, ctx: RequestContext) -> None:
    if not await require_permission(query, ctx, "backups"):
        return
    await _render(query, ctx)
    await query.answer()


@router.callback_query(AdminBackupCallback.filter(F.action == "create"))
async def on_create(query: CallbackQuery, callback_data: AdminBackupCallback, ctx: RequestContext) -> None:
    if not await require_permission(query, ctx, "backups"):
        return
    await query.answer(t("admin_bkp_started", ctx.language))
    try:
        path = await run_backup(query.bot, updated_by=ctx.user.id)
    except BackupError:
        logger.exception("backup.manual_failed")
        if query.message is not None:
            await query.message.answer(t("admin_bkp_failed", ctx.language))
        return
    if query.message is not None:
        await query.message.answer(t("admin_bkp_done", ctx.language, name=path.name))
    await _render(query, ctx)


@router.callback_query(AdminBackupCallback.filter(F.action.in_({"toggle", "hour_up", "hour_down", "keep_up", "keep_down"})))
async def on_change_setting(query: CallbackQuery, callback_data: AdminBackupCallback, ctx: RequestContext) -> None:
    if not await require_permission(query, ctx, "backups"):
        return
    cfg = await load_config()
    action = callback_data.action
    if action == "toggle":
        await save_setting("backup_enabled", not cfg.enabled, ctx.user.id)
    elif action in ("hour_up", "hour_down"):
        step = 1 if action == "hour_up" else -1
        await save_setting("backup_hour_utc", (cfg.hour_utc + step) % 24, ctx.user.id)
    else:
        step = 1 if action == "keep_up" else -1
        await save_setting("backup_keep_count", min(KEEP_MAX, max(KEEP_MIN, cfg.keep_count + step)), ctx.user.id)
    await _render(query, ctx)
    await query.answer(t("admin_action_done", ctx.language))
