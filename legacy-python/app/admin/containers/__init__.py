"""Роутер раздела админки 'Контейнеры'."""
from aiogram import Router

from app.admin.containers.panel import router as panel_router

router = Router(name="admin_containers")
router.include_router(panel_router)
