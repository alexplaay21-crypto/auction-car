"""/setlang ru|en — язык группы, только админы группы."""
from __future__ import annotations

from aiogram import Router
from aiogram.types import Message

from app.core.context import RequestContext
from app.filters.command_alias import CommandAlias
from app.repositories.group import GroupRepository

router = Router(name="settings_setlang")

SETLANG_ALIASES = ("setlang", "язык")
_LANGS = {"ru": "ru", "рус": "ru", "русский": "ru", "en": "en", "eng": "en", "англ": "en", "english": "en"}


@router.message(CommandAlias(*SETLANG_ALIASES))
async def cmd_setlang(message: Message, ctx: RequestContext, command_args: str) -> None:
    if message.chat.type not in ("group", "supergroup"):
        await message.answer("👥 Команда работает только в группе.")
        return
    member = await message.bot.get_chat_member(message.chat.id, message.from_user.id)
    if member.status not in ("administrator", "creator"):
        await message.answer("🚫 Язык группы меняют только админы группы.")
        return
    lang = _LANGS.get(command_args.strip().lower())
    if lang is None:
        await message.answer("Формат: /setlang ru  или  /setlang en")
        return
    await GroupRepository(ctx.session).set_language(message.chat.id, lang)
    await ctx.session.commit()
    await message.answer("✅ Язык группы: " + ("🇷🇺 Русский" if lang == "ru" else "🇬🇧 English"))
