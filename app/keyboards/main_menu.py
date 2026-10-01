"""Главное меню игрока (реплай-клавиатура, раздел 3 ТЗ):

🎮 Играть        👤 Профиль
🚗 Гараж         🎫 БП
⬆️ Навыки        🏆 Лидерборд
🛒 Магазин       👥 Рефералы
⚙️ Настройки
"""
from __future__ import annotations

from aiogram.types import ReplyKeyboardMarkup
from aiogram.utils.keyboard import ReplyKeyboardBuilder

from app.core.enums import Language
from app.localization import en as _en
from app.localization import ru as _ru
from app.localization.manager import t


def menu_text_variants(key: str) -> frozenset[str]:
    """Оба варианта текста (RU/EN) для заданного ключа — используется в
    фильтрах хендлеров (F.text.in_(...)), чтобы reply-кнопка распознавалась
    независимо от того, какой язык был активен в момент её отрисовки."""
    return frozenset({_ru.TEXTS[key], _en.TEXTS[key]})


def main_menu_keyboard(language: Language) -> ReplyKeyboardMarkup:
    builder = ReplyKeyboardBuilder()
    for key in (
        "menu_play", "menu_profile",
        "menu_garage", "menu_battle_pass",
        "menu_skills", "menu_leaderboard",
        "menu_shop", "menu_referrals",
        "menu_settings",
    ):
        builder.button(text=t(key, language))
    builder.adjust(2, 2, 2, 2, 1)
    return builder.as_markup(resize_keyboard=True)
