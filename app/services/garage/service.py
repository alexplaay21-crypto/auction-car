"""Логика гаража: список машин игрока (с пагинацией) и добавление новой
машины с учётом вместимости — если гараж полон, новая машина сразу
продаётся автоматически (раздел 12 ТЗ), а не добавляется."""
from __future__ import annotations

import datetime as dt

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import ObtainedFrom, TransactionType
from app.core.exceptions import AppError
from app.database.transaction import atomic, distributed_lock, new_operation_id
from app.localization.manager import t
from app.models.garage import UserCar
from app.models.user import User
from app.repositories.car import CarRepository
from app.repositories.garage import GarageRepository, UserCarRepository
from app.repositories.settings import SettingsRepository
from app.repositories.transaction import TransactionRepository
from app.repositories.user import UserRepository, UserStatsRepository
from app.utils.pagination import Page

DEFAULT_GARAGE_START_CAPACITY = 15
GARAGE_LOW_THRESHOLD = 3
GARAGE_LOW_TEXT = (
    f"ⓘ В гараже осталось {GARAGE_LOW_THRESHOLD} места. Когда гараж заполнится, "
    "новые машины будут продаваться автоматически независимо от редкости."
)


def pop_garage_low(session, user_id: int) -> bool:
    """True один раз, если после последней выдачи осталось ровно 3 места."""
    flagged = session.info.get("garage_low", set())
    if user_id in flagged:
        flagged.discard(user_id)
        return True
    return False


DEFAULT_QUICK_SELL_COMMISSION = {"regular": 0.10, "vip": 0.05}
GARAGE_PAGE_SIZE = 15


class GarageService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_or_create_garage(self, user_id: int):
        return await GarageRepository(self.session).get_or_create(user_id, DEFAULT_GARAGE_START_CAPACITY)

    async def get_cars_page(self, user_id: int, page: int) -> Page:
        repo = UserCarRepository(self.session)
        total = await repo.count_owned(user_id)
        rows = await repo.list_owned_page_with_car(
            user_id, limit=GARAGE_PAGE_SIZE, offset=(page - 1) * GARAGE_PAGE_SIZE
        )
        return Page(items=rows, page=page, page_size=GARAGE_PAGE_SIZE, total=total)

    async def _quick_sell_commission_rate(self, is_vip: bool) -> float:
        settings_repo = SettingsRepository(self.session)
        rates = await settings_repo.get_value("commission_quick_sell", DEFAULT_QUICK_SELL_COMMISSION)
        return float(rates["vip"] if is_vip else rates["regular"])

    async def add_car_to_garage(
        self, user: User, car_id: int, car_price: int, obtained_from: ObtainedFrom, when: dt.datetime,
    ) -> tuple[UserCar | None, int | None]:
        """Возвращает (user_car, None) при обычном добавлении в гараж, или
        (None, auto_sold_amount), если гараж был полон и машина сразу
        продана автоматически."""
        async with distributed_lock(f"garage:{user.id}"):
            async with atomic(self.session):
                garage_repo = GarageRepository(self.session)
                garage = await garage_repo.get_or_create(user.id, DEFAULT_GARAGE_START_CAPACITY)

                user_car_repo = UserCarRepository(self.session)
                owned_count = await user_car_repo.count_owned(user.id)

                if owned_count < garage.capacity:
                    user_car = await user_car_repo.add_car(user.id, car_id, obtained_from, when)
                    if garage.capacity - owned_count - 1 == GARAGE_LOW_THRESHOLD:
                        self.session.info.setdefault("garage_low", set()).add(user.id)
                    return user_car, None

                # Гараж полон — машина автоматически продаётся (не добавляется).
                commission_rate = await self._quick_sell_commission_rate(user.is_vip)
                sell_amount = round(car_price * (1 - commission_rate))

                user_repo = UserRepository(self.session)
                new_balance = await user_repo.increment_balance(user.id, sell_amount)

                await TransactionRepository(self.session).create(
                    user_id=user.id,
                    type_=TransactionType.QUICK_SELL,
                    amount=sell_amount,
                    balance_after=new_balance,
                    operation_id=new_operation_id(),
                    description="garage_full_auto_sell",
                )

                user.balance = new_balance
                return None, sell_amount

    async def quick_sell(self, user: User, user_car_id: int) -> int:
        """Быстрая продажа конкретной машины игрока (комиссия 'быстрого
        выкупа', раздел 11 ТЗ). Переиспользуется кнопкой '💰 Продать' сразу
        после получения машины (Auctions) и любым другим местом гаража."""
        async with distributed_lock(f"user_car:{user_car_id}"):
            async with atomic(self.session):
                user_car_repo = UserCarRepository(self.session)
                user_car = await user_car_repo.get(user_car_id)
                if user_car is None or user_car.user_id != user.id or user_car.is_sold:
                    raise AppError(t("error_not_found", user.language))

                car = await CarRepository(self.session).get(user_car.car_id)
                if car is None:
                    raise AppError(t("error_not_found", user.language))

                commission_rate = await self._quick_sell_commission_rate(user.is_vip)
                sell_amount = round(car.price * (1 - commission_rate))
                when = dt.datetime.now(dt.timezone.utc)

                await user_car_repo.mark_sold(user_car_id, sell_amount, when)

                user_repo = UserRepository(self.session)
                new_balance = await user_repo.increment_balance(user.id, sell_amount)

                await TransactionRepository(self.session).create(
                    user_id=user.id,
                    type_=TransactionType.QUICK_SELL,
                    amount=sell_amount,
                    balance_after=new_balance,
                    operation_id=new_operation_id(),
                    description=f"quick_sell_{user_car_id}",
                )
                await UserStatsRepository(self.session).increment(user.id, cars_sold=1, earned_total=sell_amount)

        user.balance = new_balance
        return sell_amount
