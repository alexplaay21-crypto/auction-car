"""Назначение админа: сначала выбор прав, потом сохранение. Только владелец."""
from __future__ import annotations

import datetime as dt

from aiogram import F, Router
from aiogram.filters.callback_data import CallbackData
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message
from aiogram.utils.keyboard import InlineKeyboardBuilder

from app.admin.admins.list import render_admins
from app.callbacks.admin import AdminAdminsCallback
from app.core.context import RequestContext
from app.core.exceptions import AppError
from app.keyboards.admin import admin_admins_list_keyboard
from app.localization.manager import t
from app.models.admin import ADMIN_PERMISSION_KEYS
from app.repositories.user import AdminRepository, UserRepository
from app.states.admin_admins import AdminAdminsStates

router = Router(name="admin_admins_add")

LABELS = {
    "users": "👤 Игроки", "economy": "💰 Экономика", "cars": "🚗 Машины",
    "containers": "📦 Контейнеры", "garage": "🏠 Гараж", "skills": "⬆️ Навыки",
    "shop": "🛒 Магазин", "battle_pass": "🎫 Battle Pass", "vip": "👑 VIP",
    "promo": "🎟 Промокоды", "groups": "👥 Группы", "broadcasts": "📣 Рассылки",
    "statistics": "📊 Статистика", "documentation": "📖 Документация",
    "backups": "💾 Бэкапы", "admins": "🛡 Админы",
}


class PermCallback(CallbackData, prefix="aperm"):
    action: str  # tog | all | none | save | cancel
    key: str = "-"


def _kb(selected: set[str]):
    b = InlineKeyboardBuilder()
    for key in ADMIN_PERMISSION_KEYS:
        b.button(text=("✅ " if key in selected else "❌ ") + LABELS.get(key, key),
                 callback_data=PermCallback(action="tog", key=key))
    b.button(text="☑️ Все", callback_data=PermCallback(action="all"))
    b.button(text="🧹 Сбросить", callback_data=PermCallback(action="none"))
    b.button(text="✅ Назначить", callback_data=PermCallback(action="save"))
    b.button(text="❌ Отмена", callback_data=PermCallback(action="cancel"))
    b.adjust(*([2] * (len(ADMIN_PERMISSION_KEYS) // 2)), 2, 2)
    return b.as_markup()


def _text(name: str, selected: set[str]) -> str:
    return f"🛡 <b>Права админа</b>\n👤 {name}\n\nВыбрано: <b>{len(selected)}/{len(ADMIN_PERMISSION_KEYS)}</b>\nНажми, чтобы включить или выключить."


@router.callback_query(AdminAdminsCallback.filter(F.action == "add"))
async def on_add_prompt(query: CallbackQuery, callback_data: AdminAdminsCallback,
                        ctx: RequestContext, state: FSMContext) -> None:
    if not ctx.is_owner:
        await query.answer(t("admin_owner_only", ctx.language), show_alert=True)
        return
    await state.set_state(AdminAdminsStates.waiting_for_add_search)
    if query.message is not None:
        await query.message.answer(t("admin_admins_add_prompt", ctx.language))
    await query.answer()


@router.message(AdminAdminsStates.waiting_for_add_search)
async def on_add_search(message: Message, ctx: RequestContext, state: FSMContext) -> None:
    await state.clear()
    users = await UserRepository(ctx.session).search((message.text or "").strip())
    if not users:
        raise AppError(t("admin_users_not_found", ctx.language))
    target = users[0]
    existing = await AdminRepository(ctx.session).get(target.id)
    selected = {k for k, v in (existing.permissions if existing and existing.is_active else {}).items() if v}
    name = f"@{target.username}" if target.username else (target.first_name or str(target.id))
    await state.update_data(perm_target=target.id, perm_name=name, perm_sel=sorted(selected))
    await message.answer(_text(name, selected), reply_markup=_kb(selected), parse_mode="HTML")


@router.callback_query(PermCallback.filter())
async def on_perm(query: CallbackQuery, callback_data: PermCallback,
                  ctx: RequestContext, state: FSMContext) -> None:
    if not ctx.is_owner:
        await query.answer(t("admin_owner_only", ctx.language), show_alert=True)
        return
    data = await state.get_data()
    target_id = data.get("perm_target")
    if target_id is None or query.message is None:
        await query.answer("Устарело, начни заново", show_alert=True)
        return
    selected = set(data.get("perm_sel", []))
    name = data.get("perm_name", str(target_id))
    act = callback_data.action

    if act == "cancel":
        await state.update_data(perm_target=None)
        await query.message.delete()
        await query.answer("Отменено")
        return
    if act == "save":
        if not selected:
            await query.answer("Выбери хотя бы одно право", show_alert=True)
            return
        perms = {k: (k in selected) for k in ADMIN_PERMISSION_KEYS}
        await AdminRepository(ctx.session).upsert(
            target_id, perms, ctx.user.id, dt.datetime.now(dt.timezone.utc))
        await ctx.session.commit()
        await state.update_data(perm_target=None)
        try:
            names = "\n".join(LABELS.get(k, k) for k in ADMIN_PERMISSION_KEYS if k in selected)
            await query.bot.send_message(
                target_id, f"🛡 <b>Ты назначен админом!</b>\n\nТвои права:\n{names}\n\nОткрой: /admin",
                parse_mode="HTML")
        except Exception:
            pass
        text, rows = await render_admins(ctx)
        await query.message.edit_text(
            t("admin_admins_added", ctx.language).replace(" со всеми правами", "") + "\n\n" + text,
            reply_markup=admin_admins_list_keyboard(ctx.language, rows))
        await query.answer("Готово")
        return

    if act == "tog":
        selected ^= {callback_data.key}
    elif act == "all":
        selected = set(ADMIN_PERMISSION_KEYS)
    elif act == "none":
        selected = set()
    await state.update_data(perm_sel=sorted(selected))
    await query.message.edit_text(_text(name, selected), reply_markup=_kb(selected), parse_mode="HTML")
    await query.answer()
