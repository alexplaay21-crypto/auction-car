"""Общий роутер раздела battle_pass: экран «🎫 БП»."""
from __future__ import annotations

from aiogram import Router

from app.handlers.battle_pass.battle_pass import router as battle_pass_router

router = Router(name="battle_pass")
router.include_router(battle_pass_router)
