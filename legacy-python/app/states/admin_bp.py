"""FSM админ-раздела 'Battle Pass': создание пропуска и добавление награды
к уровню."""
from __future__ import annotations

from aiogram.fsm.state import State, StatesGroup


class AdminBpStates(StatesGroup):
    waiting_for_create = State()
    waiting_for_add_reward = State()
