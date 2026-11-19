"""FSM админ-раздела 'Рассылки': контент → (опционально) кнопки, дальше —
аудитория и расписание выбираются inline-кнопками (не FSM)."""
from __future__ import annotations

from aiogram.fsm.state import State, StatesGroup


class AdminBroadcastStates(StatesGroup):
    waiting_for_content = State()
    waiting_for_buttons = State()
