"""Общий роутер раздела auction: вход в комнату (🎮 Играть), /chance,
/container, /bet, /stop, выход из комнаты."""
from __future__ import annotations

from aiogram import Router

from app.handlers.auction.bet import router as bet_router
from app.handlers.auction.container import router as container_router
from app.handlers.auction.leave import router as leave_router
from app.handlers.auction.room import router as room_router
from app.handlers.auction.stop import router as stop_router

router = Router(name="auction")
router.include_router(room_router)
router.include_router(container_router)
router.include_router(bet_router)
router.include_router(stop_router)
router.include_router(leave_router)
