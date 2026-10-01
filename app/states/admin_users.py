"""FSM для админ-раздела 'Пользователи': поиск по ID/username, ввод
дельты баланса (кому именно — хранится в FSMContext.data, не в самом
состоянии)."""
from __future__ import annotations

from aiogram.fsm.state import State, StatesGroup


class AdminUserStates(StatesGroup):
    waiting_for_search = State()
    waiting_for_balance_delta = State()
    # Выдача/изъятие предметов: что именно — в FSMContext.data["admin_item_action"].
    waiting_for_item = State()
