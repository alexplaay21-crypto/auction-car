"""Общий роутер раздела economy: /sellcar, /sell (+ accept/decline офера),
/transfer."""
from __future__ import annotations

from aiogram import Router

from app.handlers.economy.sales import router as sales_router
from app.handlers.economy.transfer import router as transfer_router

router = Router(name="economy")
router.include_router(sales_router)
router.include_router(transfer_router)
