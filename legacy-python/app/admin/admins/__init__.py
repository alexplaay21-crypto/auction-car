"""Роутер раздела админки 'Администраторы': список, назначение, снятие
(назначение/снятие — только владелец)."""
from __future__ import annotations

from aiogram import Router

from app.admin.admins.add import router as add_router
from app.admin.admins.list import router as list_router
from app.admin.admins.remove import router as remove_router

router = Router(name="admin_admins")
router.include_router(list_router)
router.include_router(add_router)
router.include_router(remove_router)
