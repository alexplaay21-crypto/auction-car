"""Роутер раздела админки 'Магазин'."""
from aiogram import Router

from app.admin.shop.panel import router as panel_router

router = Router(name="admin_shop")
router.include_router(panel_router)
