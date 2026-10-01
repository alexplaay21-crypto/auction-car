"""/help — короткая справка, указывает на Настройки → Документацию за
подробностями (полноценные разделы появятся на этапе Documentation)."""
from __future__ import annotations

from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

from app.core.context import RequestContext
from app.localization.manager import t

router = Router(name="common_help")


@router.message(Command("help"))
async def cmd_help(message: Message, ctx: RequestContext) -> None:
    await message.answer(t("help_text", ctx.language))
