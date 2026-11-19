"""Доступ к магазину: ShopSettings, ShopLot, ShopLotItem, Purchase."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import select, update

from app.models.purchase import Purchase
from app.models.shop import ShopSettings
from app.models.shop_lot import ShopLot
from app.models.shop_lot_item import ShopLotItem
from app.repositories.base import BaseRepository
from app.repositories.history import record_event

SHOP_SETTINGS_SINGLETON_ID = 1


class ShopSettingsRepository(BaseRepository[ShopSettings]):
    model = ShopSettings

    async def get_singleton(self) -> ShopSettings:
        settings_row = await self.get(SHOP_SETTINGS_SINGLETON_ID)
        if settings_row is None:
            settings_row = ShopSettings(id=SHOP_SETTINGS_SINGLETON_ID, is_enabled=True)
            self.add(settings_row)
            await self.flush()
        return settings_row

    async def set_enabled(self, enabled: bool) -> None:
        await self.session.execute(
            update(ShopSettings).where(ShopSettings.id == SHOP_SETTINGS_SINGLETON_ID).values(is_enabled=enabled)
        )


class ShopLotRepository(BaseRepository[ShopLot]):
    model = ShopLot

    async def list_available(self, now: dt.datetime) -> list[ShopLot]:
        stmt = (
            select(ShopLot)
            .where(
                ShopLot.is_available.is_(True),
                (ShopLot.available_from.is_(None)) | (ShopLot.available_from <= now),
                (ShopLot.available_until.is_(None)) | (ShopLot.available_until >= now),
            )
            .order_by(ShopLot.sort_order, ShopLot.id)
        )
        return list((await self.session.execute(stmt)).scalars())

    async def list_all(self, limit: int = 30) -> list[ShopLot]:
        """Все лоты, включая недоступные (для админки)."""
        stmt = select(ShopLot).order_by(ShopLot.id.desc()).limit(limit)
        return list((await self.session.execute(stmt)).scalars())

    async def create(self, **fields) -> ShopLot:
        lot = ShopLot(**fields)
        self.add(lot)
        await self.flush()
        return lot

    async def update_fields(self, lot_id: int, **fields) -> None:
        if fields:
            await self.session.execute(update(ShopLot).where(ShopLot.id == lot_id).values(**fields))

    async def delete_by_id(self, lot_id: int) -> None:
        lot = await self.get(lot_id)
        if lot is not None:
            await self.delete(lot)


class ShopLotItemRepository(BaseRepository[ShopLotItem]):
    model = ShopLotItem

    async def list_for_lot(self, lot_id: int) -> list[ShopLotItem]:
        stmt = select(ShopLotItem).where(ShopLotItem.lot_id == lot_id)
        return list((await self.session.execute(stmt)).scalars())

    async def add_item(self, lot_id: int, item_type, payload: dict, quantity: int = 1) -> ShopLotItem:
        item = ShopLotItem(lot_id=lot_id, item_type=item_type, payload=payload, quantity=quantity)
        self.add(item)
        return item


class PurchaseRepository(BaseRepository[Purchase]):
    model = Purchase

    async def create(self, user_id: int, lot_id: int, price_paid: int) -> Purchase:
        purchase = Purchase(user_id=user_id, lot_id=lot_id, price_paid=price_paid)
        self.add(purchase)
        await self.session.flush()  # получить уникальный ID покупки для журнала
        record_event(
            self.session, user_id, "shop_purchase",
            {"purchase_id": purchase.id, "lot_id": lot_id, "price": price_paid},
        )
        return purchase

    async def list_for_user(self, user_id: int) -> list[Purchase]:
        stmt = select(Purchase).where(Purchase.user_id == user_id).order_by(Purchase.id.desc())
        return list((await self.session.execute(stmt)).scalars())

    async def has_purchased_any(self, user_id: int) -> bool:
        stmt = select(Purchase.id).where(Purchase.user_id == user_id).limit(1)
        return (await self.session.execute(stmt)).scalar_one_or_none() is not None
