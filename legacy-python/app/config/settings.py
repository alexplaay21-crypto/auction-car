"""
Настройки приложения.

Все параметры читаются из переменных окружения / .env через pydantic-settings.
Если .env отсутствует или обязательные поля не заполнены — main.py должен
запустить мастер первого запуска (scripts/setup.py) до старта бота.
"""
from __future__ import annotations

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[2]
ENV_PATH = BASE_DIR / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ENV_PATH),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Telegram ---
    bot_token: str = Field(default="", alias="BOT_TOKEN")
    owner_id: int = Field(default=0, alias="OWNER_ID")

    # --- Webhook ---
    use_webhook: bool = Field(default=True, alias="USE_WEBHOOK")
    webhook_domain: str = Field(default="", alias="WEBHOOK_DOMAIN")
    webhook_path: str = Field(default="/webhook", alias="WEBHOOK_PATH")
    webhook_secret: str = Field(default="", alias="WEBHOOK_SECRET")
    webapp_host: str = Field(default="0.0.0.0", alias="WEBAPP_HOST")
    webapp_port: int = Field(default=8080, alias="WEBAPP_PORT")

    # --- PostgreSQL ---
    postgres_url: str = Field(default="", alias="POSTGRES_URL")

    # --- Redis ---
    redis_url: str = Field(default="", alias="REDIS_URL")

    # --- Misc ---
    env: str = Field(default="production", alias="ENV")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    default_language: str = Field(default="ru", alias="DEFAULT_LANGUAGE")

    run_migrations: bool = Field(default=True, alias="RUN_MIGRATIONS")

    @property
    def webhook_host(self) -> str:
        """Домен без схемы и хвостового слеша (на случай ввода https://...)."""
        host = self.webhook_domain.strip()
        for prefix in ("https://", "http://"):
            if host.startswith(prefix):
                host = host[len(prefix):]
        return host.rstrip("/")

    @property
    def webhook_url(self) -> str:
        path = self.webhook_path if self.webhook_path.startswith("/") else f"/{self.webhook_path}"
        return f"https://{self.webhook_host}{path}"

    @property
    def webhook_secret_token(self) -> str:
        """Секрет заголовка X-Telegram-Bot-Api-Secret-Token: из .env, а если
        не задан — детерминированно выводится из токена бота (одинаков у всех
        экземпляров, не требует ручной настройки; допустимые символы Telegram)."""
        if self.webhook_secret:
            return self.webhook_secret
        import hashlib

        return hashlib.sha256(f"webhook:{self.bot_token}".encode()).hexdigest()

    def is_configured(self) -> bool:
        """Достаточно ли данных, чтобы стартовать без мастера первого запуска."""
        required = [self.bot_token, self.owner_id, self.postgres_url, self.redis_url]
        if self.use_webhook:
            required.append(self.webhook_domain)
        return all(required)


def load_settings() -> Settings:
    return Settings()


settings = load_settings()
