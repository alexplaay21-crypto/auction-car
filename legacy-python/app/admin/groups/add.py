"""Добавление группы (раздел 27 ТЗ) происходит автоматически: как только
бот получает апдейт из группы, LanguageMiddleware/UserMiddleware не
регистрируют группу сами — это делает первый администраторский шаг: любой
администратор бота, находясь в группе, вызывает /admin_addgroup, и группа
регистрируется с языком по умолчанию."""
from __future__ import annotations

from aiogram import Router
from aiogram.types import Message

from app.core.context import RequestContext
from app.core.exceptions import AppError
from app.filters.admin import IsAdmin
from app.filters.command_alias import CommandAlias
from app.filters.group import IsGroupChat
from app.localization.manager import t
from app.repositories.group import GroupRepository

router = Router(name="admin_groups_add")
router.message.filter(IsAdmin())

ALIASES = ("admin_addgroup", "addgroup")


@router.message(CommandAlias(*ALIASES), IsGroupChat())
async def cmd_add_group(message: Message, ctx: RequestContext, command_args: str) -> None:
    if message.chat.title is None:
        raise AppError(t("error_generic", ctx.language))

    group_repo = GroupRepository(ctx.session)
    await group_repo.upsert(message.chat.id, message.chat.title, ctx.user.id, ctx.language.value)
    await message.answer(t("admin_group_added", ctx.language))
