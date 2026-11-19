"""Доступ к рефералам: Referral."""
from __future__ import annotations

from sqlalchemy import func, select

from app.models.referral import Referral
from app.repositories.base import BaseRepository
from app.repositories.history import record_event


class ReferralRepository(BaseRepository[Referral]):
    model = Referral

    async def get_by_invited(self, invited_id: int) -> Referral | None:
        stmt = select(Referral).where(Referral.invited_id == invited_id)
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def create(self, inviter_id: int, invited_id: int) -> Referral:
        referral = Referral(inviter_id=inviter_id, invited_id=invited_id)
        self.add(referral)
        record_event(self.session, inviter_id, "referral_invited", {"invited_id": invited_id})
        record_event(self.session, invited_id, "referral_joined", {"inviter_id": inviter_id})
        return referral

    async def mark_inviter_bonus_paid(self, referral_id: int) -> None:
        referral = await self.get(referral_id)
        if referral:
            referral.inviter_bonus_paid = True

    async def mark_invited_bonus_paid(self, referral_id: int) -> None:
        referral = await self.get(referral_id)
        if referral:
            referral.invited_bonus_paid = True

    async def mark_first_purchase_bonus_paid(self, referral_id: int) -> None:
        referral = await self.get(referral_id)
        if referral:
            referral.first_purchase_bonus_paid = True

    async def count_for_inviter(self, inviter_id: int) -> int:
        stmt = select(func.count()).select_from(Referral).where(Referral.inviter_id == inviter_id)
        return (await self.session.execute(stmt)).scalar_one()

    async def list_for_inviter(self, inviter_id: int) -> list[Referral]:
        stmt = select(Referral).where(Referral.inviter_id == inviter_id).order_by(Referral.id.desc())
        return list((await self.session.execute(stmt)).scalars())
