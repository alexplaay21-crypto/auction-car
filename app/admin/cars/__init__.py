"""Роутер раздела админки 'Машины': список/карточка, создание, правка,
скрытие/возврат."""
from __future__ import annotations

from aiogram import Router

from app.admin.cars.create import router as create_router
from app.admin.cars.delete import router as delete_router
from app.admin.cars.edit import router as edit_router
from app.admin.cars.list import router as list_router

router = Router(name="admin_cars")
router.include_router(list_router)
router.include_router(create_router)
router.include_router(edit_router)
router.include_router(delete_router)
