"""/cancel (отмена | cancel) — выход из любого многошагового ввода (FSM):
промокод, поиск/правка в админке и т.д. Роутер common подключён первым,
а собственные хендлеры роутера проверяются раньше вложенных, поэтому
отмена срабатывает даже когда активен обработчик состояния из другого
раздела."""
from __future__ import annotations

from aiogram import Router
from aiogram.filters import StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.types import Message

from app.core.context import RequestContext
from app.filters.command_alias import CommandAlias
from app.localization.manager import t

router = Router(name="common_cancel")

ALIASES = ("cancel", "отмена")


@router.message(CommandAlias(*ALIASES), StateFilter("*"))
async def cmd_cancel(message: Message, ctx: RequestContext, state: FSMContext, command_args: str) -> None:
    await state.clear()
    await message.answer(t("cancelled", ctx.language))
