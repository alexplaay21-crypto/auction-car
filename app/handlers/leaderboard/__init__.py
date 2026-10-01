"""Общий роутер раздела leaderboard: /top и глобальные лидерборды."""
from __future__ import annotations

from aiogram import Router

from app.handlers.leaderboard.leaderboard import router as leaderboard_router

router = Router(name="leaderboard")
router.include_router(leaderboard_router)
