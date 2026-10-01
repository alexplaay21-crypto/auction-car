"""Фильтр для команд с RU/EN алиасами (в т.ч. кириллическими, без '/' —
см. utils/telegram.py:parse_command_args). Используется почти во всех
игровых командах ТЗ: /container (конты/конт), /bet (ставка/с), /stop
(стоп/ст), /car (авто/а), /sellcar, /sell, /transfer, /top, /inventory,
/chance, /vip, /language и т.д.

При успехе возвращает dict — aiogram сливает его в data, поэтому хендлер
может просто принять аргумент command_args: str."""
from __future__ import annotations

from aiogram.filters import BaseFilter
from aiogram.types import Message

from app.utils.telegram import parse_command_args


class CommandAlias(BaseFilter):
    def __init__(self, *aliases: str) -> None:
        self.aliases = set(aliases)

    async def __call__(self, message: Message) -> bool | dict[str, str]:
        args = parse_command_args(message.text, self.aliases)
        if args is None:
            return False
        return {"command_args": args}
