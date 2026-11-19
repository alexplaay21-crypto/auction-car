"""Общий роутер раздела garage: /car, экран гаража с пагинацией,
расширение, быстрая продажа."""
from __future__ import annotations

from aiogram import Router

from app.handlers.garage.car import router as car_router
from app.handlers.garage.containers import router as containers_router
from app.handlers.garage.garage import router as garage_router
from app.handlers.garage.sell import router as sell_router
from app.handlers.garage.upgrade import router as upgrade_router

router = Router(name="garage")
router.include_router(garage_router)
router.include_router(car_router)
router.include_router(upgrade_router)
router.include_router(sell_router)
router.include_router(containers_router)
