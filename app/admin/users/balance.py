"""Изменение баланса игрока администратором (раздел 27 ТЗ). Ввод — через
FSM: после нажатия кнопки бот просит число (можно со знаком: +1000/-500)."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.admin.permissions import require_permission
from app.admin.users.profile import render_profile_card
from app.callbacks.admin import AdminUserCallback
from app.core.context import RequestContext
from app.core.enums import TransactionType
from app.database.transaction import atomic, distributed_lock, new_operation_id
from app.keyboards.admin import admin_user_card_keyboard
from app.localization.manager import t
from app.repositories.history import record_event
from app.repositories.transaction import TransactionRepository
from app.repositories.user import UserRepository
from app.states.admin_users import AdminUserStates

router = Router(name="admin_users_balance")


@router.callback_query(AdminUserCallback.filter(F.action == "balance_prompt"))
async def on_balance_prompt(
    query: CallbackQuery, callback_data: AdminUserCallback, ctx: RequestContext, state: FSMContext
) -> None:
    if not await require_permission(query, ctx, "users"):
        return

    await state.set_state(AdminUserStates.waiting_for_balance_delta)
    await state.update_data(admin_target_user_id=callback_data.user_id)
    if query.message is not None:
        await query.message.answer(t("admin_balance_prompt", ctx.language))
    await query.answer()


@router.message(AdminUserStates.waiting_for_balance_delta)
async def on_balance_delta_entered(message: Message, ctx: RequestContext, state: FSMContext) -> None:
    data = await state.get_data()
    await state.clear()
    target_user_id = data.get("admin_target_user_id")

    raw = (message.text or "").strip().replace("+", "")
    if target_user_id is None or not raw.lstrip("-").isdigit():
        await message.answer(t("admin_balance_invalid", ctx.language))
        return

    delta = int(raw)

    async with distributed_lock(f"admin_balance:{target_user_id}"):
        async with atomic(ctx.session):
            user_repo = UserRepository(ctx.session)
            target = await user_repo.get(target_user_id)
            if target is None:
                await message.answer(t("error_not_found", ctx.language))
                return

            if target.balance + delta < 0:
                await message.answer(t("admin_balance_invalid", ctx.language))
                return

            new_balance = await user_repo.increment_balance(target_user_id, delta)
            record_event(
                ctx.session, target_user_id, "admin_balance",
                {"delta": delta, "balance_after": new_balance}, actor_admin_id=ctx.user.id,
            )
            await TransactionRepository(ctx.session).create(
                user_id=target_user_id, type_=TransactionType.ADMIN_ADJUST, amount=delta,
                balance_after=new_balance, operation_id=new_operation_id(),
                description=f"admin_adjust_by_{ctx.user.id}",
            )

    target.balance = new_balance
    text = await render_profile_card(ctx, target)
    await message.answer(text, reply_markup=admin_user_card_keyboard(ctx.language, target))
