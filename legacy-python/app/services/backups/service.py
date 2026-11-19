"""Ежедневный бэкап БД (раздел 27 ТЗ): создаётся автоматически, отправляется
ТОЛЬКО владельцу (не всем админам). Параметры (вкл/выкл, час UTC, сколько
копий хранить) лежат в Setting и меняются в админке.

Устойчивость: распределённый лок (несколько экземпляров бота не сделают два
бэкапа), отметка о последнем запуске в БД (рестарт не дублирует и не
пропускает), если Telegram недоступен — файл остаётся и отправка
повторяется на следующем тике."""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from pathlib import Path

from aiogram import Bot
from aiogram.types import FSInputFile

from app.config.logging import get_logger
from app.config.settings import BASE_DIR, settings
from app.core.constants import TELEGRAM_UPLOAD_LIMIT_BYTES
from app.core.exceptions import ConcurrencyError
from app.database.session import get_session
from app.database.transaction import distributed_lock
from app.repositories.settings import SettingsRepository
from app.services.backups.postgres import dump_database

logger = get_logger(__name__)

BACKUP_DIR = BASE_DIR / "backups"
FILE_PREFIX = "car_auction_"
FILE_SUFFIX = ".dump"

DEFAULTS = {"backup_enabled": True, "backup_hour_utc": 3, "backup_keep_count": 7}
KEEP_MIN, KEEP_MAX = 1, 60


@dataclass(slots=True)
class BackupConfig:
    enabled: bool
    hour_utc: int
    keep_count: int
    last_run: dt.datetime | None
    unsent: str | None


async def load_config() -> BackupConfig:
    async with get_session() as session:
        values = await SettingsRepository(session).get_many(
            [*DEFAULTS, "backup_last_run", "backup_unsent"]
        )
    last = values.get("backup_last_run")
    return BackupConfig(
        enabled=bool(values.get("backup_enabled", DEFAULTS["backup_enabled"])),
        hour_utc=int(values.get("backup_hour_utc", DEFAULTS["backup_hour_utc"])) % 24,
        keep_count=max(KEEP_MIN, int(values.get("backup_keep_count", DEFAULTS["backup_keep_count"]))),
        last_run=dt.datetime.fromisoformat(last) if last else None,
        unsent=values.get("backup_unsent"),
    )


async def save_setting(key: str, value, updated_by: int | None = None) -> None:
    async with get_session() as session:
        async with session.begin():
            await SettingsRepository(session).set_value(key, value, updated_by)


def list_backups(limit: int | None = None) -> list[Path]:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(BACKUP_DIR.glob(f"{FILE_PREFIX}*{FILE_SUFFIX}"), reverse=True)
    return files[:limit] if limit else files


def prune_backups(keep: int) -> int:
    removed = 0
    for old in list_backups()[keep:]:
        old.unlink(missing_ok=True)
        removed += 1
    return removed


async def create_backup() -> Path:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d_%H%M%S")
    path = BACKUP_DIR / f"{FILE_PREFIX}{stamp}{FILE_SUFFIX}"
    await dump_database(path)
    logger.info("backup.created", file=path.name, size=path.stat().st_size)
    return path


async def send_to_owner(bot: Bot, path: Path) -> bool:
    """False — отправка не удалась (повторим позже). Слишком большой файл
    не повторяется: владельцу уходит уведомление с именем файла на сервере."""
    if not settings.owner_id:
        return False
    try:
        if path.stat().st_size > TELEGRAM_UPLOAD_LIMIT_BYTES:
            await bot.send_message(
                settings.owner_id,
                f"💾 {path.name}\n>50 MB — файл не отправить в Telegram.\nСервер: backups/{path.name}",
            )
            return True
        await bot.send_document(settings.owner_id, FSInputFile(path), caption=f"💾 {path.name}")
        return True
    except Exception:
        logger.exception("backup.send_failed", file=path.name)
        return False


async def run_backup(bot: Bot, updated_by: int | None = None) -> Path:
    """Создать бэкап, отправить владельцу, подчистить старые."""
    path = await create_backup()
    cfg = await load_config()
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    sent = await send_to_owner(bot, path)
    await save_setting("backup_last_run", now, updated_by)
    await save_setting("backup_unsent", None if sent else path.name, updated_by)
    prune_backups(cfg.keep_count)
    return path


async def backup_tick(bot: Bot) -> None:
    """Вызывается раз в минуту: делает бэкап, если наступил час и сегодня
    (UTC) он ещё не делался; досылает неотправленный."""
    cfg = await load_config()
    if cfg.unsent:
        path = BACKUP_DIR / cfg.unsent
        if path.exists() and await send_to_owner(bot, path):
            await save_setting("backup_unsent", None)
        elif not path.exists():
            await save_setting("backup_unsent", None)

    if not cfg.enabled:
        return
    now = dt.datetime.now(dt.timezone.utc)
    if now.hour < cfg.hour_utc:
        return
    if cfg.last_run is not None and cfg.last_run.astimezone(dt.timezone.utc).date() == now.date():
        return

    try:
        async with distributed_lock("backup:daily", timeout=3600, blocking_timeout=1):
            cfg = await load_config()  # перепроверка под локом
            if cfg.last_run is not None and cfg.last_run.astimezone(dt.timezone.utc).date() == now.date():
                return
            await run_backup(bot)
    except ConcurrencyError:
        return  # другой экземпляр уже делает бэкап
