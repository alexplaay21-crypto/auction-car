from aiogram.fsm.state import State, StatesGroup


class AdminPromoStates(StatesGroup):
    waiting_for_create = State()
    code = State()
    limit = State()
    value = State()
