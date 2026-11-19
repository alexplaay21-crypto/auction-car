"""Доступ к истории VIP: VipGrant."""
from __future__ import annotations

from sqlalchemy import select

from app.core.enums import VipSource
from app.models.vip import VipGrant
from app.repositories.base import BaseRepository


class VipGrantRepository(BaseRepository[VipGrant]):
    model = VipGrant

    async def create(
        self, user_id: int, source: VipSource, price_paid: int | None = None, granted_by: int | None = None,
    ) -> VipGrant:
        grant = VipGrant(user_id=user_id, source=source, price_paid=price_paid, granted_by=granted_by)
        self.add(grant)
        return grant

    async def list_for_user(self, user_id: int) -> list[VipGrant]:
        stmt = select(VipGrant).where(VipGrant.user_id == user_id).order_by(VipGrant.id.desc())
        return list((await self.session.execute(stmt)).scalars())
