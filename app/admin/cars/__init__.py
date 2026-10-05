"""Роутер раздела админки 'Машины'."""
from aiogram import Router

from app.admin.cars.panel import router as panel_router

router = Router(name="admin_cars")
router.include_router(panel_router)
