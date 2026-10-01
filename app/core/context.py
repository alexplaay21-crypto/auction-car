"""Контекст обработки одного Telegram-апдейта.

Заполняется в middlewares (app/middlewares/database.py, user.py, language.py —
этап Middlewares) и прокидывается в handlers через data aiogram, чтобы не
доставать сессию/пользователя/язык в каждом хендлере вручную."""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import Language
from app.models.user import User


@dataclass(slots=True)
class RequestContext:
    session: AsyncSession
    user: User
    language: Language
    is_owner: bool
    is_admin: bool

    def t(self, ru: str, en: str) -> str:
        """Временный помощник до появления полноценной локализации (этап
        Localization) — выбирает текст по языку контекста."""
        return ru if self.language == Language.RU else en
