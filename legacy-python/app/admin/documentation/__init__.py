"""Роутер раздела админки 'Документация'."""
from __future__ import annotations

from aiogram import Router

from app.admin.documentation.links import router as links_router
from app.admin.documentation.create import router as create_router
from app.admin.documentation.delete import router as delete_router
from app.admin.documentation.list import router as list_router

router = Router(name="admin_documentation")
router.include_router(links_router)
router.include_router(list_router)
router.include_router(create_router)
router.include_router(delete_router)
