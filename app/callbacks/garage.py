"""CallbackData для раздела гаража: пагинация списка, расширение,
быстрая продажа конкретной машины (переиспользуется и из Auctions —
кнопка '💰 Продать' сразу после получения машины)."""
from __future__ import annotations

from aiogram.filters.callback_data import CallbackData


class GaragePageCallback(CallbackData, prefix="garage_page"):
    page: int


class GarageUpgradeCallback(CallbackData, prefix="garage_upgrade"):
    action: str  # "buy"


class GarageSellCallback(CallbackData, prefix="garage_sell"):
    user_car_id: int


class ContainerInvCallback(CallbackData, prefix="cinv"):
    action: str  # "list" | "open"
    container_id: int = 0


class SellConfirmCallback(CallbackData, prefix="sellc"):
    kind: str  # "state" | "quick"
    user_car_id: int
    yes: bool


class SellPlayerCallback(CallbackData, prefix="sellp"):
    user_car_id: int
    buyer_id: int
    price: int
    yes: bool
