"""Просмотр лотов магазина (раздел 23 ТЗ)."""
from __future__ import annotations

import datetime as dt

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import Language
from app.core.exceptions import NotFoundError
from app.localization.manager import t
from app.models.shop_lot import ShopLot
from app.repositories.shop import ShopLotRepository


class ShopService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_available(self) -> list[ShopLot]:
        now = dt.datetime.now(dt.timezone.utc)
        return await ShopLotRepository(self.session).list_available(now)

    async def get_lot_or_raise(self, lot_id: int, language: Language) -> ShopLot:
        lot = await ShopLotRepository(self.session).get(lot_id)
        if lot is None:
            raise NotFoundError(t("error_not_found", language))
        return lot
