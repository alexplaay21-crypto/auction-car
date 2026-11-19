"""Перехватывает исключения и показывает игроку понятное сообщение вместо
падения/тишины (требование ТЗ: 'Все ошибки должны обрабатываться и
показываться пользователю понятным сообщением'). Регистрируется САМЫМ
первым (outer-most), чтобы ловить ошибки из всех остальных middlewares и
хендлеров, включая сбои самого database.py."""
from __future__ import annotations

from typing import Any, Awaitable, Callable

from aiogram import BaseMiddleware
from aiogram.types import CallbackQuery, Message, TelegramObject

from app.config.logging import get_logger
from app.core.enums import Language
from app.core.exceptions import AppError
from app.database.session import get_session
from app.repositories.history import HistoryRepository
from app.services.statistics.service import SYSTEM_ERROR_EVENT
from app.localization.manager import t

logger = get_logger(__name__)


class ErrorsMiddleware(BaseMiddleware):
    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        try:
            return await handler(event, data)
        except AppError as exc:
            # exc.message формируется вызывающим сервисом (в т.ч. через
            # localization.manager.t(...) на этапах Auctions/Economy/...),
            # здесь мы только доставляем его пользователю.
            await self._reply(event, exc.message)
            return None
        except Exception as exc:
            logger.exception("unhandled_error")
            await self._record(exc_type=type(exc).__name__, text=str(exc), data=data, event=event)
            await self._reply(event, t("error_generic", self._resolve_language(data)))
            return None

    @staticmethod
    async def _record(exc_type: str, text: str, data: dict[str, Any], event: TelegramObject) -> None:
        """Пишет необработанную ошибку в журнал (для админ-статистики) в
        ОТДЕЛЬНОЙ сессии: основная могла быть откачена. Сбой записи не должен
        ломать ответ пользователю."""
        try:
            ctx = data.get("ctx")
            async with get_session() as session:
                async with session.begin():
                    await HistoryRepository(session).add_event(
                        user_id=ctx.user.id if ctx else None,
                        event_type=SYSTEM_ERROR_EVENT,
                        payload={"error": exc_type, "message": text[:300], "update": type(event).__name__},
                    )
        except Exception:
            logger.exception("error_record_failed")

    @staticmethod
    def _resolve_language(data: dict[str, Any]) -> Language | None:
        ctx = data.get("ctx")
        return ctx.language if ctx else None

    @staticmethod
    async def _reply(event: TelegramObject, text: str) -> None:
        try:
            if isinstance(event, CallbackQuery):
                await event.answer(text, show_alert=True)
            elif isinstance(event, Message):
                await event.answer(text)
        except Exception:
            logger.exception("error_reply_failed")
