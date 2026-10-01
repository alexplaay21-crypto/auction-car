"""Роутер раздела админки 'Магазин'."""
from __future__ import annotations

from aiogram import Router

from app.admin.shop.create import router as create_router
from app.admin.shop.delete import router as delete_router
from app.admin.shop.edit import router as edit_router
from app.admin.shop.list import router as list_router

router = Router(name="admin_shop")
router.include_router(list_router)
router.include_router(create_router)
router.include_router(edit_router)
router.include_router(delete_router)
