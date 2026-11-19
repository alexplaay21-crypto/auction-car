"""Роутер раздела админки 'Рассылки': список/карточка, создание (мастер:
контент → кнопки → аудитория → расписание), остановка, удаление."""
from __future__ import annotations

from aiogram import Router

from app.admin.broadcasts.create import router as create_router
from app.admin.broadcasts.delete import router as delete_router
from app.admin.broadcasts.list import router as list_router
from app.admin.broadcasts.pause import router as pause_router

router = Router(name="admin_broadcasts")
router.include_router(list_router)
router.include_router(create_router)
router.include_router(pause_router)
router.include_router(delete_router)
