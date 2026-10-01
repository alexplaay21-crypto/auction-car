"""Роутер раздела админки 'Промокоды'."""
from __future__ import annotations

from aiogram import Router

from app.admin.promo.create import router as create_router
from app.admin.promo.delete import router as delete_router
from app.admin.promo.list import router as list_router

router = Router(name="admin_promo")
router.include_router(list_router)
router.include_router(create_router)
router.include_router(delete_router)
