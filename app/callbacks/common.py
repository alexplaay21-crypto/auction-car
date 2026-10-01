"""CallbackData-фабрики, общие для нескольких разделов (онбординг, настройки)."""
from __future__ import annotations

from aiogram.filters.callback_data import CallbackData


class LanguageCallback(CallbackData, prefix="lang"):
    code: str          # "ru" | "en"
    context: str        # "onboarding" | "settings"


class DocsCallback(CallbackData, prefix="docs"):
    action: str          # "agree"
