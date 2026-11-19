"""Роутер раздела админки 'База данных': экспорт/импорт игровой
конфигурации."""
from __future__ import annotations

from aiogram import Router

from app.admin.database.export import router as export_router
from app.admin.database.import_ import router as import_router

router = Router(name="admin_database")
router.include_router(export_router)
router.include_router(import_router)
