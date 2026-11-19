"""Ручной бэкап БД без бота: python scripts/backup.py
Файл попадает в backups/ (в Telegram не отправляется)."""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.backups.service import create_backup  # noqa: E402


def main() -> None:
    path = asyncio.run(create_backup())
    print(f"Готово: {path}")


if __name__ == "__main__":
    main()
