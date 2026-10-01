"""Доступ к единому key-value хранилищу игровых параметров: Setting.

Это основной механизм 'не хардкодить параметры' — сервисы читают отсюда
(с опциональным кэшем в Redis на этапе Redis), админка пишет сюда."""
from __future__ import annotations

from sqlalchemy import select

from app.models.setting import Setting
from app.repositories.base import BaseRepository


class SettingsRepository(BaseRepository[Setting]):
    model = Setting

    async def get_value(self, key: str, default=None):
        row = await self.get(key)
        return row.value if row is not None else default

    async def get_many(self, keys: list[str]) -> dict[str, object]:
        stmt = select(Setting).where(Setting.key.in_(keys))
        rows = (await self.session.execute(stmt)).scalars()
        return {row.key: row.value for row in rows}

    async def get_all(self) -> dict[str, object]:
        stmt = select(Setting)
        rows = (await self.session.execute(stmt)).scalars()
        return {row.key: row.value for row in rows}

    async def set_value(self, key: str, value, updated_by: int | None = None) -> Setting:
        row = await self.get(key)
        if row is None:
            row = Setting(key=key, value=value, updated_by=updated_by)
            self.add(row)
        else:
            row.value = value
            row.updated_by = updated_by
        return row
