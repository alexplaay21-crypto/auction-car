"""FSM админ-раздела 'Промокоды': создание промокода."""
from __future__ import annotations

from aiogram.fsm.state import State, StatesGroup


class AdminPromoStates(StatesGroup):
    waiting_for_create = State()
