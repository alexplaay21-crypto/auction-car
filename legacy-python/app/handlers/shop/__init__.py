"""Общий роутер раздела shop: экран «🛒 Магазин»."""
from __future__ import annotations

from aiogram import Router

from app.handlers.shop.shop import router as shop_router

router = Router(name="shop")
router.include_router(shop_router)
