"""Общий роутер раздела promo: активация промокода."""
from __future__ import annotations

from aiogram import Router

from app.handlers.promo.promo import router as promo_router

router = Router(name="promo")
router.include_router(promo_router)
