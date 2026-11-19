"""Проверка конкретного права администратора внутри раздела. Общий доступ
к самой админ-панели уже даёт filters/admin.py:IsAdmin() (подключён на
уровне app/admin/router.py) — здесь тонкая проверка на конкретный ключ
(app.models.admin.ADMIN_PERMISSION_KEYS), чтобы администратор без права
'users' не мог, например, менять баланс игрока. Владелец проходит всегда."""
from __future__ import annotations

from aiogram.types import CallbackQuery, Message

from app.core.context import RequestContext
from app.core.permissions import has_permission
from app.localization.manager import t


async def require_permission(event: Message | CallbackQuery, ctx: RequestContext, key: str) -> bool:
    if await has_permission(ctx.session, ctx.user.id, key):
        return True
    text = t("admin_permission_denied", ctx.language)
    if isinstance(event, CallbackQuery):
        await event.answer(text, show_alert=True)
    elif isinstance(event, Message):
        await event.answer(text)
    return False
