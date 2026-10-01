"""Восстановление БД из дампа: python scripts/restore.py backups/car_auction_XXXX.dump
ПЕРЕЗАПИСЫВАЕТ текущие данные. Остановите бота перед запуском.
Восстановление идёт одной транзакцией: при ошибке БД остаётся как была."""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.backups.postgres import restore_database  # noqa: E402


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("Использование: python scripts/restore.py <файл.dump>")
    path = Path(sys.argv[1])
    if not path.is_file():
        sys.exit(f"Файл не найден: {path}")
    answer = input(f"Перезаписать текущую БД данными из {path.name}? Введите YES: ").strip()
    if answer != "YES":
        sys.exit("Отменено.")
    asyncio.run(restore_database(path))
    print("Готово. Запустите бота.")


if __name__ == "__main__":
    main()
