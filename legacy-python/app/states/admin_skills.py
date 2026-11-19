"""FSM раздела 'Навыки' в админке."""
from __future__ import annotations

from aiogram.fsm.state import State, StatesGroup


class AdminSkillStates(StatesGroup):
    waiting_for_data = State()
