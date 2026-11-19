"""Роутер раздела админки 'Battle Pass'."""
from aiogram import Router

from app.admin.battle_pass.panel import router as panel_router

router = Router(name="admin_battle_pass")
router.include_router(panel_router)
