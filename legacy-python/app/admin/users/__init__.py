"""Роутер раздела админки 'Пользователи': поиск, карточка, баланс,
бан/разбан, VIP, история. Выдача/отзыв машин — следующая часть."""
from __future__ import annotations

from aiogram import Router

from app.admin.users.balance import router as balance_router
from app.admin.users.ban import router as ban_router
from app.admin.users.history import router as history_router
from app.admin.users.items import router as items_router
from app.admin.users.profile import router as profile_router
from app.admin.users.extra import router as extra_router
from app.admin.users.list import router as list_router
from app.admin.users.search import router as search_router
from app.admin.users.vip import router as vip_router

router = Router(name="admin_users")
router.include_router(list_router)
router.include_router(extra_router)
router.include_router(search_router)
router.include_router(profile_router)
router.include_router(balance_router)
router.include_router(ban_router)
router.include_router(vip_router)
router.include_router(history_router)
router.include_router(items_router)
