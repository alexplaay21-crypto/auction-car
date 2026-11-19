"""Общий роутер раздела vip: /vip (статус, покупка)."""
from __future__ import annotations

from aiogram import Router

from app.handlers.vip.vip import router as vip_router

router = Router(name="vip")
router.include_router(vip_router)
