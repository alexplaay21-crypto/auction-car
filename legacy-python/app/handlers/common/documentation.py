"""Показ документации. Во время онбординга — встроенный краткий интро-текст
(шаг 2 первого запуска). Полноценные редактируемые разделы документации
(DocumentationRepository) появятся на этапах Documentation/Settings — этот
хендлер уже готов переиспользовать show_documentation_intro для обоих
сценариев."""
from __future__ import annotations

from aiogram.types import CallbackQuery, Message

from app.core.enums import Language
from app.keyboards.common import docs_agree_keyboard
from app.localization.manager import t


async def show_documentation_intro(target: Message | CallbackQuery, language: Language) -> None:
    text = t("docs_intro", language)
    markup = docs_agree_keyboard(language)
    if isinstance(target, CallbackQuery):
        if target.message is not None:
            await target.message.edit_text(text, reply_markup=markup)
    else:
        await target.answer(text, reply_markup=markup)
