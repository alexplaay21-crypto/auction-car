"""FSM админ-раздела 'Администраторы': поиск игрока для назначения."""
from __future__ import annotations

from aiogram.fsm.state import State, StatesGroup


class AdminAdminsStates(StatesGroup):
    waiting_for_add_search = State()
