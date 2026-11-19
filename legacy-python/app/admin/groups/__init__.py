"""Роутер раздела админки 'Группы': список/карточка, добавление (команда в
группе), вкл/выкл аукциона, удаление из управления."""
from __future__ import annotations

from aiogram import Router

from app.admin.groups.add import router as add_router
from app.admin.groups.delete import router as delete_router
from app.admin.groups.edit import router as edit_router
from app.admin.groups.list import router as list_router

from app.admin.groups.add_form import router as add_form_router

router = Router(name="admin_groups")
router.include_router(list_router)
router.include_router(add_router)
router.include_router(edit_router)
router.include_router(delete_router)
router.include_router(add_form_router)
