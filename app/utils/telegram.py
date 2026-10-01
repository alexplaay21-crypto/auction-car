"""Вспомогательные функции для разбора Telegram-сообщений."""
from __future__ import annotations


def parse_command_args(text: str | None, aliases: set[str]) -> str | None:
    """Достаёт аргументы команды, если текст сообщения начинается с одного
    из алиасов — с ведущим '/' или без него. RU-алиасы (например, 'авто',
    'а') всегда без слэша: Telegram не поддерживает кириллицу в
    slash-командах, поэтому они распознаются как обычный текст. Возвращает
    None, если ни один алиас не подошёл, иначе — остаток строки (аргументы)."""
    if not text:
        return None
    stripped = text.strip()
    lowered = stripped.lower()

    for alias in aliases:
        for prefix in (f"/{alias}", alias):
            prefix_lower = prefix.lower()
            if lowered == prefix_lower:
                return ""
            if lowered.startswith(prefix_lower + " "):
                return stripped[len(prefix):].strip()
    return None
