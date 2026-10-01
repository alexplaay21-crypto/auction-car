"""Общий роутер раздела settings. Пока — служебная реакция на удаление
бота из группы; экраны настроек (язык/помощь/документация/промокод/группа/
поддержка) добавляются сюда отдельными роутерами."""
from __future__ import annotations

from aiogram import Router

from app.handlers.settings.group import router as group_router

router = Router(name="settings")
router.include_router(group_router)
