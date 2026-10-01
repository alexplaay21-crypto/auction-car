"""⬆️ Навыки: навыки игрока (полученные из BP, магазина, промокодов, админом)."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.types import Message

from app.core.context import RequestContext
from app.keyboards.main_menu import menu_text_variants
from app.localization.manager import t
from app.repositories.skill import SkillRepository, UserSkillRepository

router = Router(name="skills")


@router.message(F.text.in_(menu_text_variants("menu_skills")))
async def show_skills(message: Message, ctx: RequestContext) -> None:
    owned = await UserSkillRepository(ctx.session).list_for_user(ctx.user.id)
    if not owned:
        await message.answer(t("skills_empty", ctx.language))
        return
    skill_repo = SkillRepository(ctx.session)
    lines = [t("skills_title", ctx.language)]
    for user_skill in owned:
        skill = await skill_repo.get(user_skill.skill_id)
        if skill is None:
            continue
        line = t("skills_line", ctx.language, name=skill.name, level=user_skill.level, max_level=skill.max_level)
        if skill.description:
            line += f"\n   {skill.description}"
        lines.append(line)
    await message.answer("\n".join(lines))
