"""Общий роутер раздела battle_pass: экран «🎫 БП»."""
from __future__ import annotations

from aiogram import Router

from app.handlers.battle_pass.battle_pass import router as battle_pass_router

from app.handlers.battle_pass.payment import router as payment_router

router = Router(name="battle_pass")
router.include_router(payment_router)
router.include_router(battle_pass_router)
