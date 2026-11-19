"""Роутер раздела админки 'VIP'."""
from __future__ import annotations

from aiogram import Router

from app.admin.vip.settings import router as settings_router

router = Router(name="admin_vip")
router.include_router(settings_router)
