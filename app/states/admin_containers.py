"""FSM админ-раздела 'Контейнеры': создание, правка, состав (привязка
машин с весами выпадения). ID контейнера — в FSMContext.data."""
from __future__ import annotations

from aiogram.fsm.state import State, StatesGroup


class AdminContainerStates(StatesGroup):
    waiting_for_create = State()
    waiting_for_edit = State()
    waiting_for_add_car = State()
    waiting_for_remove_car = State()
