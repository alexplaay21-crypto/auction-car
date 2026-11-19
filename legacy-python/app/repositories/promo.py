"""Доступ к промокодам: PromoCode, PromoRedemption."""
from __future__ import annotations

from sqlalchemy import select, update

from app.models.promo_code import PromoCode
from app.models.promo_redemption import PromoRedemption
from app.repositories.base import BaseRepository
from app.repositories.history import record_event


class PromoCodeRepository(BaseRepository[PromoCode]):
    model = PromoCode

    async def get_by_code(self, code: str) -> PromoCode | None:
        stmt = select(PromoCode).where(PromoCode.code == code)
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def create(self, **fields) -> PromoCode:
        promo = PromoCode(**fields)
        self.add(promo)
        return promo

    async def increment_activations(self, promo_id: int) -> int:
        stmt = (
            update(PromoCode)
            .where(PromoCode.id == promo_id)
            .values(activations_count=PromoCode.activations_count + 1)
            .returning(PromoCode.activations_count)
        )
        return (await self.session.execute(stmt)).scalar_one()

    async def set_active(self, promo_id: int, is_active: bool) -> None:
        await self.session.execute(update(PromoCode).where(PromoCode.id == promo_id).values(is_active=is_active))

    async def list_all(self) -> list[PromoCode]:
        stmt = select(PromoCode).order_by(PromoCode.id.desc())
        return list((await self.session.execute(stmt)).scalars())


class PromoRedemptionRepository(BaseRepository[PromoRedemption]):
    model = PromoRedemption

    async def has_redeemed(self, promo_code_id: int, user_id: int) -> bool:
        stmt = select(PromoRedemption.id).where(
            PromoRedemption.promo_code_id == promo_code_id, PromoRedemption.user_id == user_id
        )
        return (await self.session.execute(stmt)).scalar_one_or_none() is not None

    async def create(self, promo_code_id: int, user_id: int) -> PromoRedemption:
        redemption = PromoRedemption(promo_code_id=promo_code_id, user_id=user_id)
        self.add(redemption)
        record_event(self.session, user_id, "promo_redeemed", {"promo_code_id": promo_code_id})
        return redemption
