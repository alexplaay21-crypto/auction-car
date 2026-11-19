"""FSM админ-раздела 'Гараж': тарифы расширения и лимиты вместимости."""
from __future__ import annotations

from aiogram.fsm.state import State, StatesGroup


class AdminGarageStates(StatesGroup):
    waiting_for_tier_add = State()
    waiting_for_tier_del = State()
    waiting_for_limits = State()
