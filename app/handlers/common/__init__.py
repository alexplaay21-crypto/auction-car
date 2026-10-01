"""Общий роутер раздела common: /start, выбор языка, документация,
согласие, /help. Подключается в core/dispatcher.py:register_routers()."""
from __future__ import annotations

from aiogram import Router

from app.handlers.common.agreement import router as agreement_router
from app.handlers.common.cancel import router as cancel_router
from app.handlers.common.help import router as help_router
from app.handlers.common.language import router as language_router
from app.handlers.common.start import router as start_router

router = Router(name="common")
router.include_router(cancel_router)
router.include_router(start_router)
router.include_router(language_router)
router.include_router(agreement_router)
router.include_router(help_router)
