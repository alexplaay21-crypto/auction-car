"""
Мастер первого запуска.

Если .env отсутствует или неполон — интерактивно запрашивает у владельца
необходимые параметры (BOT_TOKEN, OWNER_ID, POSTGRES_URL, REDIS_URL,
webhook/domain и т.д.) и создаёт .env. Секреты в Git не попадают
(.env добавлен в .gitignore).

Запускается автоматически из app/main.py, если settings.is_configured()
возвращает False. Можно запустить и вручную: python scripts/setup.py
"""
from __future__ import annotations

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
ENV_PATH = BASE_DIR / ".env"
ENV_EXAMPLE_PATH = BASE_DIR / ".env.example"

PROMPTS: list[tuple[str, str, str]] = [
    # (KEY, вопрос, default)
    ("BOT_TOKEN", "Токен бота (от @BotFather)", ""),
    ("OWNER_ID", "Ваш Telegram ID (владелец бота)", ""),
    ("POSTGRES_URL", "Строка подключения PostgreSQL", "postgresql+asyncpg://user:password@localhost:5432/car_auction_bot"),
    ("REDIS_URL", "Строка подключения Redis", "redis://localhost:6379/0"),
    ("USE_WEBHOOK", "Использовать webhook? (true/false)", "true"),
    ("WEBHOOK_DOMAIN", "Домен для webhook (например bot.example.com)", ""),
    ("DEFAULT_LANGUAGE", "Язык по умолчанию (ru/en)", "ru"),
]


def _ask(question: str, default: str) -> str:
    suffix = f" [{default}]" if default else ""
    value = input(f"{question}{suffix}: ").strip()
    return value or default


def run_setup() -> dict[str, str]:
    print("=== Первый запуск: настройка car-auction-bot ===")
    values: dict[str, str] = {}
    for key, question, default in PROMPTS:
        values[key] = _ask(question, default)

    # производные/фиксированные значения, не требующие диалога
    values.setdefault("WEBHOOK_PATH", "/webhook")
    values.setdefault("WEBHOOK_SECRET", "")
    values.setdefault("WEBAPP_HOST", "0.0.0.0")
    values.setdefault("WEBAPP_PORT", "8080")
    values.setdefault("RUN_MIGRATIONS", "true")
    values.setdefault("ENV", "production")
    values.setdefault("LOG_LEVEL", "INFO")

    write_env(values)
    print(f"\nГотово! Конфигурация сохранена в {ENV_PATH}")
    return values


def write_env(values: dict[str, str]) -> None:
    lines = [f"{key}={value}" for key, value in values.items()]
    ENV_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def ensure_configured() -> None:
    """Вызывается из main.py перед стартом бота."""
    sys.path.insert(0, str(BASE_DIR))
    from app.config.settings import load_settings  # noqa: E402

    settings = load_settings()
    if not settings.is_configured():
        run_setup()


if __name__ == "__main__":
    run_setup()
