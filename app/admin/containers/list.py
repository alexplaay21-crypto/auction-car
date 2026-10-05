"""Раздел 'Контейнеры': список (включая выключенные) и карточка с составом
(машины и веса выпадения)."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery

from app.admin.permissions import require_permission
from app.callbacks.admin import AdminContainerCallback, AdminMenuCallback
from app.core.context import RequestContext
from app.keyboards.admin import admin_container_card_keyboard, admin_containers_list_keyboard
from app.localization.manager import t
from app.models.container import Container
from app.repositories.container import ContainerCarRepository, ContainerRepository

router = Router(name="admin_containers_list")


async def render_container_admin_card(ctx: RequestContext, container: Container) -> str:
    lines = [
        f"📦 {container.name} (ID {container.id})",
        f"🌍 {container.country or '—'}",
        t("admin_container_price_line", ctx.language, price=container.price),
    ]
    ch = getattr(container, "rarity_chances", None)
    if ch:
        lines.append("🎲 Шансы: " + " / ".join(f"{ch.get(k, 0):g}" for k in ("common", "rare", "epic", "mythic")))
    else:
        lines.append("🎲 Шансы: общие")
    if not container.is_enabled:
        lines.append(t("admin_container_disabled_label", ctx.language))

    rows = await ContainerCarRepository(ctx.session).list_for_container_with_car(container.id)
    lines.append("")
    if not rows:
        lines.append(t("admin_container_no_cars", ctx.language))
    for link, car in rows:
        lines.append(
            t("admin_container_cars_line", ctx.language,
              car_id=car.id, name=car.name, weight=link.drop_weight)
        )
    return "\n".join(lines)


@router.callback_query(AdminMenuCallback.filter(F.section == "containers"))
async def on_open_containers_section(
    query: CallbackQuery, callback_data: AdminMenuCallback, ctx: RequestContext, state: FSMContext
) -> None:
    if not await require_permission(query, ctx, "containers"):
        return
    await state.clear()
    containers = await ContainerRepository(ctx.session).list_all()
    title = (
        t("admin_containers_title", ctx.language) if containers
        else t("admin_containers_empty", ctx.language)
    )
    if query.message is not None:
        await query.message.edit_text(
            title, reply_markup=admin_containers_list_keyboard(ctx.language, containers)
        )
    await query.answer()


@router.callback_query(AdminContainerCallback.filter(F.action == "view"))
async def on_view_container(
    query: CallbackQuery, callback_data: AdminContainerCallback, ctx: RequestContext
) -> None:
    if not await require_permission(query, ctx, "containers"):
        return
    container = await ContainerRepository(ctx.session).get(callback_data.container_id)
    if container is None:
        await query.answer(t("error_not_found", ctx.language), show_alert=True)
        return
    if query.message is not None:
        await query.message.edit_text(
            await render_container_admin_card(ctx, container),
            reply_markup=admin_container_card_keyboard(ctx.language, container),
        )
    await query.answer()
