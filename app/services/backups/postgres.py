"""Обёртка над pg_dump / pg_restore. Пароль передаётся через PGPASSWORD, а не
в аргументах (иначе он виден в списке процессов). Формат дампа — custom (-Fc):
сжат и восстанавливается через pg_restore."""
from __future__ import annotations

import asyncio
import os
from pathlib import Path

from sqlalchemy.engine import make_url

from app.config.settings import settings
from app.core.exceptions import AppError

DUMP_TIMEOUT_SECONDS = 1800


class BackupError(AppError):
    pass


def _conn_args() -> tuple[list[str], dict[str, str]]:
    url = make_url(settings.postgres_url)
    args = ["-h", url.host or "localhost", "-p", str(url.port or 5432), "-U", url.username or "postgres"]
    env = dict(os.environ)
    if url.password:
        env["PGPASSWORD"] = url.password
    return args + ["-d", url.database or ""], env


async def _run(cmd: list[str], env: dict[str, str]) -> None:
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd, env=env, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError as exc:
        raise BackupError(f"{cmd[0]} not found: install postgresql-client") from exc
    try:
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=DUMP_TIMEOUT_SECONDS)
    except asyncio.TimeoutError as exc:
        proc.kill()
        raise BackupError(f"{cmd[0]} timeout") from exc
    if proc.returncode != 0:
        raise BackupError(f"{cmd[0]} failed: {stderr.decode(errors='replace')[-500:]}")


async def dump_database(target: Path) -> None:
    """Пишет во временный файл и переименовывает — недописанный дамп
    никогда не выглядит готовым бэкапом."""
    conn, env = _conn_args()
    tmp = target.with_suffix(target.suffix + ".part")
    try:
        await _run(["pg_dump", "-Fc", *conn, "-f", str(tmp)], env)
        tmp.replace(target)
    finally:
        tmp.unlink(missing_ok=True)


async def restore_database(source: Path) -> None:
    conn, env = _conn_args()
    await _run(
        ["pg_restore", "--clean", "--if-exists", "--no-owner", "--single-transaction", *conn, str(source)],
        env,
    )
