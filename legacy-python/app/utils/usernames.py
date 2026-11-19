"""Форматирование кликабельных упоминаний игроков (раздел 19 ТЗ): 👑 перед
VIP, ссылка на профиль по Telegram ID (работает и без username — через
tg://user?id=, как того требует ТЗ)."""
from __future__ import annotations

from html import escape as _escape

from app.models.user import User


def format_mention(user: User) -> str:
    display = f"@{user.username}" if user.username else (user.first_name or str(user.id))
    prefix = "👑 " if user.is_vip else ""
    return f'{prefix}<a href="tg://user?id={user.id}">{_escape(display)}</a>'
