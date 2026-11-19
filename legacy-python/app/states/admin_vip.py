"""FSM админ-раздела 'VIP': правка цены и комиссий."""
from __future__ import annotations

from aiogram.fsm.state import State, StatesGroup


class AdminVipStates(StatesGroup):
    waiting_for_edit = State()
