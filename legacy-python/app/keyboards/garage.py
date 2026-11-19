"""Клавиатуры раздела гаража: пагинация + (в ЛС) кнопка расширения."""
from __future__ import annotations
from app.utils.loc import loc

from aiogram.types import InlineKeyboardMarkup
from aiogram.utils.keyboard import InlineKeyboardBuilder

from app.callbacks.garage import ContainerInvCallback, GaragePageCallback, GarageUpgradeCallback
from app.core.enums import Language
from app.localization.manager import t
from app.utils.pagination import Page


def garage_keyboard(language: Language, page_obj: Page, show_upgrade: bool) -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    row_sizes: list[int] = []

    nav_count = 0
    if page_obj.has_prev:
        builder.button(text="◀️", callback_data=GaragePageCallback(page=page_obj.page - 1))
        nav_count += 1
    if page_obj.has_next:
        builder.button(text="▶️", callback_data=GaragePageCallback(page=page_obj.page + 1))
        nav_count += 1
    if nav_count:
        row_sizes.append(nav_count)

    if show_upgrade:
        builder.button(text=t("garage_upgrade_btn", language), callback_data=GarageUpgradeCallback(action="buy"))
        row_sizes.append(1)

    if row_sizes:
        builder.adjust(*row_sizes)
    return builder.as_markup()


def container_inventory_keyboard(language: Language, rows: list) -> InlineKeyboardMarkup:
    """rows: [(UserContainer, Container), ...]"""
    builder = InlineKeyboardBuilder()
    for user_container, container in rows:
        builder.button(
            text=t("container_inv_open_btn", language, name=loc(container, "name", language), qty=user_container.quantity),
            callback_data=ContainerInvCallback(action="open", container_id=container.id),
        )
    builder.adjust(1)
    return builder.as_markup()
