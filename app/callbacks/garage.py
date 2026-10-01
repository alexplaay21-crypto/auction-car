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
