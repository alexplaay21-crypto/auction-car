"""Роутер раздела админки 'Battle Pass'."""
from __future__ import annotations

from aiogram import Router

from app.admin.battle_pass.create import router as create_router
from app.admin.battle_pass.edit import router as edit_router
from app.admin.battle_pass.list import router as list_router

router = Router(name="admin_battle_pass")
router.include_router(list_router)
router.include_router(create_router)
router.include_router(edit_router)
