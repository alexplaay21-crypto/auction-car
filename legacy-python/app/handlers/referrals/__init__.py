"""Общий роутер раздела referrals: экран «👥 Рефералы»."""
from __future__ import annotations

from aiogram import Router

from app.handlers.referrals.referrals import router as referrals_router

router = Router(name="referrals")
router.include_router(referrals_router)
