"""Роутер раздела админки 'Контейнеры': список/карточка, создание, правка
и состав, включение/выключение."""
from __future__ import annotations

from aiogram import Router

from app.admin.containers.create import router as create_router
from app.admin.containers.delete import router as delete_router
from app.admin.containers.edit import router as edit_router
from app.admin.containers.list import router as list_router

router = Router(name="admin_containers")
router.include_router(list_router)
router.include_router(create_router)
router.include_router(edit_router)
router.include_router(delete_router)
