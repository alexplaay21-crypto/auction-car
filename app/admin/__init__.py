"""Админ-панель бота (раздел 27 ТЗ). Точка входа — app.admin.router:router,
подключается в core/dispatcher.py:register_routers()."""
from __future__ import annotations

from app.admin.router import router

__all__ = ["router"]
