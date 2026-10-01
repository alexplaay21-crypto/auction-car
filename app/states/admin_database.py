"""FSM админ-раздела 'База данных': ожидание файла импорта и подтверждение
(импорт ОБЯЗАТЕЛЬНО подтверждается, раздел 27 ТЗ)."""
from __future__ import annotations

from aiogram.fsm.state import State, StatesGroup


class AdminDatabaseStates(StatesGroup):
    waiting_for_import_file = State()
    waiting_for_import_confirm = State()
