"""Базовый generic-репозиторий: общие get/add/delete поверх AsyncSession.
Конкретные репозитории (app/repositories/*) добавляют доменные запросы.
Здесь НЕ должно быть игровых правил — только доступ к данным."""
from __future__ import annotations

from typing import Generic, TypeVar

from sqlalchemy.ext.asyncio import AsyncSession

from app.database.base import Base

ModelT = TypeVar("ModelT", bound=Base)


class BaseRepository(Generic[ModelT]):
    model: type[ModelT]

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, pk) -> ModelT | None:
        return await self.session.get(self.model, pk)

    def add(self, obj: ModelT) -> ModelT:
        self.session.add(obj)
        return obj

    async def delete(self, obj: ModelT) -> None:
        await self.session.delete(obj)

    async def flush(self) -> None:
        """Протолкнуть изменения в рамках текущей транзакции без commit
        (получить сгенерированные id и т.п.). commit делает atomic() вызывающего кода."""
        await self.session.flush()
