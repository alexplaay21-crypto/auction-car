"""Текст и точка входа главного меню админ-панели (клавиатура —
keyboards/admin.py:admin_menu_keyboard, переиспользуется отсюда и при
возврате 'назад' из разделов)."""
from __future__ import annotations

from app.core.enums import Language
from app.localization.manager import t


def admin_menu_text(language: Language) -> str:
    return t("admin_menu_title", language)
