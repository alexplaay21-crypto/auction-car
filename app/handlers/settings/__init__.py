"""Общий роутер раздела settings. Пока — служебная реакция на удаление
бота из группы; экраны настроек (язык/помощь/документация/промокод/группа/
поддержка) добавляются сюда отдельными роутерами."""
from __future__ import annotations

from aiogram import Router

from app.handlers.settings.group import router as group_router

from app.handlers.settings.main import router as main_router

router = Router(name="settings")
from app.handlers.settings.support import router as support_router

from app.handlers.settings.setlang import router as setlang_router

router.include_router(main_router)
router.include_router(setlang_router)
router.include_router(support_router)
router.include_router(group_router)
