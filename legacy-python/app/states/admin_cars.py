"""FSM админ-раздела 'Машины': создание и редактирование (ID редактируемой
машины хранится в FSMContext.data)."""
from __future__ import annotations

from aiogram.fsm.state import State, StatesGroup


class AdminCarStates(StatesGroup):
    waiting_for_create = State()
    waiting_for_edit = State()
