"""'Удаление' контейнера = выключение (is_enabled=False): по нему могут
существовать завершённые аукционы (FK RESTRICT), физическое удаление
сломало бы историю. Выключенный контейнер не выпадает в новых раундах."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.types import CallbackQuery

from app.admin.containers.list import render_container_admin_card
from app.admin.permissions import require_permission
from app.callbacks.admin import AdminContainerCallback
from app.core.context import RequestContext
from app.keyboards.admin import admin_container_card_keyboard
from app.localization.manager import t
from app.repositories.container import ContainerRepository

router = Router(name="admin_containers_delete")


@router.callback_query(AdminContainerCallback.filter(F.action == "toggle"))
async def on_toggle_container(
    query: CallbackQuery, callback_data: AdminContainerCallback, ctx: RequestContext
) -> None:
    if not await require_permission(query, ctx, "containers"):
        return
    repo = ContainerRepository(ctx.session)
    container = await repo.get(callback_data.container_id)
    if container is None:
        await query.answer(t("error_not_found", ctx.language), show_alert=True)
        return

    enabled = not container.is_enabled
    await repo.set_enabled(container.id, enabled)
    container.is_enabled = enabled

    if query.message is not None:
        await query.message.edit_text(
            await render_container_admin_card(ctx, container),
            reply_markup=admin_container_card_keyboard(ctx.language, container),
        )
    await query.answer(t("admin_action_done", ctx.language))
