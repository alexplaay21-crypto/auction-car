"""Тексты на двух языках: поле + поле_en. Нет английского, показываем русский."""
from __future__ import annotations


def loc(obj, field: str, language) -> str | None:
    if str(getattr(language, "value", language)).lower() == "en":
        v = getattr(obj, field + "_en", None)
        if v:
            return v
    return getattr(obj, field, None)


def split_bi(raw: str):
    """'Дубай | Dubai' -> ('Дубай', 'Dubai'); без второй части английский None."""
    parts = (raw or "").split("|", 1)
    ru = parts[0].strip()
    en = parts[1].strip() if len(parts) > 1 else ""
    return (None if ru in ("", "-") else ru), (None if en in ("", "-") else en)
