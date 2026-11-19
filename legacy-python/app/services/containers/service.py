"""Логика доступа к контейнерам: список включённых, случайный выбор
контейнера для нового раунда, обёртка над рандомайзером выпадения машины.

Сама привязка к комнате/аукциону (когда именно запускать новый контейнер)
реализуется на этапе Auctions — здесь только независимая от комнат часть."""
from __future__ import annotations

import random

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import Language
from app.core.exceptions import AppError
from app.localization.manager import t
from app.models.car import Car
from app.models.container import Container
from app.repositories.container import ContainerRepository
from app.services.containers.randomizer import ContainerRandomizer


class ContainerService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.randomizer = ContainerRandomizer(session)

    async def pick_random_enabled_container(self, language: Language) -> Container:
        """Контейнеры выпадают на рандом (раздел 6 ТЗ)."""
        containers = await ContainerRepository(self.session).list_enabled()
        if not containers:
            raise AppError(t("container_none_enabled", language))
        return random.choice(containers)

    async def roll_car_for_container(self, container_id: int, language: Language) -> Car:
        return await self.randomizer.roll_car(container_id, language)
