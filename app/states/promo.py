"""FSM для ввода промокода (раздел 24-25 ТЗ): после команды/кнопки ждём
следующее сообщение с кодом. В отличие от онбординга (states/registration.py),
здесь состояние оправдано — это genuinely многошаговый ввод произвольного
текста, а не то, что можно вывести из полей БД."""
from __future__ import annotations

from aiogram.fsm.state import State, StatesGroup


class PromoStates(StatesGroup):
    waiting_for_code = State()
