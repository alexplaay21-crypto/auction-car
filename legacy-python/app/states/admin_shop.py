"""FSM админ-раздела 'Магазин': создание/правка лота и добавление предмета
в его состав."""
from __future__ import annotations

from aiogram.fsm.state import State, StatesGroup


class AdminShopStates(StatesGroup):
    waiting_for_create = State()
    waiting_for_edit = State()
    waiting_for_add_item = State()
