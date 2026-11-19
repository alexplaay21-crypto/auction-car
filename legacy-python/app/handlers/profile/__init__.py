"""Общий роутер раздела profile: экран профиля, ежедневный бонус, статистика."""
from __future__ import annotations

from aiogram import Router

from app.handlers.profile.daily_bonus import router as daily_bonus_router
from app.handlers.profile.profile import router as profile_router
from app.handlers.profile.statistics import router as statistics_router

router = Router(name="profile")
router.include_router(profile_router)
router.include_router(daily_bonus_router)
router.include_router(statistics_router)
