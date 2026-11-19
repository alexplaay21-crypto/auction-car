"""FSM админ-раздела 'Документация': создание/правка раздела сразу для
RU и EN одним сообщением."""
from __future__ import annotations

from aiogram.fsm.state import State, StatesGroup


class AdminDocumentationStates(StatesGroup):
    waiting_for_section_key = State()
    waiting_for_content = State()
