"""Раздел 'Навыки': список, создание, удаление. Навык — предмет, который можно
выдать наградой (BP/магазин/промокод) или из админки; у игрока он виден в
⬆️ Навыки. Формат создания: Название | Описание | макс. уровень."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.admin.permissions import require_permission
from app.callbacks.admin import AdminMenuCallback, AdminSkillCallback
from app.core.context import RequestContext
from app.keyboards.admin import admin_skill_card_keyboard, admin_skills_keyboard
from app.localization.manager import t
from app.repositories.skill import SkillRepository
from app.states.admin_skills import AdminSkillStates

router = Router(name="admin_skills")


async def _show_list(query: CallbackQuery, ctx: RequestContext) -> None:
    skills = await SkillRepository(ctx.session).list_all()
    text = t("admin_skills_title" if skills else "admin_skills_empty", ctx.language)
    if query.message is not None:
        await query.message.edit_text(text, reply_markup=admin_skills_keyboard(ctx.language, skills))


@router.callback_query(AdminMenuCallback.filter(F.section == "skills"))
async def on_open(query: CallbackQuery, callback_data: AdminMenuCallback, ctx: RequestContext) -> None:
    if not await require_permission(query, ctx, "skills"):
        return
    await _show_list(query, ctx)
    await query.answer()


@router.callback_query(AdminMenuCallback.filter(F.section == "skills_create"))
async def on_create_prompt(
    query: CallbackQuery, callback_data: AdminMenuCallback, ctx: RequestContext, state: FSMContext
) -> None:
    if not await require_permission(query, ctx, "skills"):
        return
    await state.set_state(AdminSkillStates.waiting_for_data)
    if query.message is not None:
        await query.message.answer(t("admin_skill_create_prompt", ctx.language))
    await query.answer()


@router.message(AdminSkillStates.waiting_for_data)
async def on_create_data(message: Message, ctx: RequestContext, state: FSMContext) -> None:
    await state.clear()
    parts = [p.strip() for p in (message.text or "").split("|")]
    if len(parts) != 3 or not parts[0] or not parts[2].isdigit() or int(parts[2]) < 1:
        await message.answer(t("admin_skill_create_invalid", ctx.language))
        return
    skill = await SkillRepository(ctx.session).create(
        name=parts[0], description=parts[1] or None, effect={}, max_level=int(parts[2]),
    )
    await ctx.session.flush()
    await message.answer(
        t("admin_skill_created", ctx.language, id=skill.id, name=skill.name),
    )


@router.callback_query(AdminSkillCallback.filter(F.action == "view"))
async def on_view(query: CallbackQuery, callback_data: AdminSkillCallback, ctx: RequestContext) -> None:
    if not await require_permission(query, ctx, "skills"):
        return
    skill = await SkillRepository(ctx.session).get(callback_data.skill_id)
    if skill is None:
        await query.answer(t("error_not_found", ctx.language), show_alert=True)
        return
    text = t("admin_skill_card", ctx.language, id=skill.id, name=skill.name,
             description=skill.description or "—", max_level=skill.max_level)
    if query.message is not None:
        await query.message.edit_text(text, reply_markup=admin_skill_card_keyboard(ctx.language, skill))
    await query.answer()


@router.callback_query(AdminSkillCallback.filter(F.action == "delete"))
async def on_delete(query: CallbackQuery, callback_data: AdminSkillCallback, ctx: RequestContext) -> None:
    if not await require_permission(query, ctx, "skills"):
        return
    skill = await SkillRepository(ctx.session).get(callback_data.skill_id)
    if skill is not None:
        await ctx.session.delete(skill)
        await ctx.session.flush()
    await _show_list(query, ctx)
    await query.answer(t("admin_action_done", ctx.language))
