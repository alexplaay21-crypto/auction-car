"""Роутер раздела админки 'Гараж'."""
from __future__ import annotations

from aiogram import Router

from app.admin.garage.settings import router as settings_router

router = Router(name="admin_garage")
router.include_router(settings_router)
