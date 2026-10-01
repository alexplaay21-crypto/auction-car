"""Клавиатуры админ-панели: главное меню разделов, карточка игрока с
действиями."""
from __future__ import annotations

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup
from aiogram.utils.keyboard import InlineKeyboardBuilder

from app.callbacks.admin import AdminMenuCallback, AdminStatsCallback, AdminUserCallback
from app.core.enums import Language
from app.localization.manager import t
from app.models.user import User

ADMIN_SECTIONS = (
    "users", "cars", "containers", "garage", "skills", "shop", "battle_pass",
    "vip", "promo", "groups", "broadcasts", "statistics",
    "documentation", "database", "backups", "admins",
)


def admin_menu_keyboard(language: Language) -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    for section in ADMIN_SECTIONS:
        builder.button(
            text=t(f"admin_section_{section}", language),
            callback_data=AdminMenuCallback(section=section),
        )
    builder.adjust(2)
    return builder.as_markup()


def admin_user_card_keyboard(language: Language, user: User) -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    builder.button(
        text=t("admin_action_balance", language),
        callback_data=AdminUserCallback(user_id=user.id, action="balance_prompt"),
    )
    if user.is_banned:
        builder.button(
            text=t("admin_action_unban", language),
            callback_data=AdminUserCallback(user_id=user.id, action="unban"),
        )
    else:
        builder.button(
            text=t("admin_action_ban", language),
            callback_data=AdminUserCallback(user_id=user.id, action="ban"),
        )
    if user.is_vip:
        builder.button(
            text=t("admin_action_vip_revoke", language),
            callback_data=AdminUserCallback(user_id=user.id, action="vip_revoke"),
        )
    else:
        builder.button(
            text=t("admin_action_vip_grant", language),
            callback_data=AdminUserCallback(user_id=user.id, action="vip_grant"),
        )
    for action in ("car_give", "car_take", "container_give", "container_take",
                   "bp_give", "skill_give", "garage_set"):
        builder.button(
            text=t(f"admin_item_{action}_btn", language),
            callback_data=AdminUserCallback(user_id=user.id, action=action),
        )
    from app.callbacks.admin import AdminHistoryCallback

    builder.button(
        text=t("admin_action_history", language),
        callback_data=AdminHistoryCallback(user_id=user.id, page=0),
    )
    builder.adjust(1, 2, 1, 2, 2, 1, 1, 1)
    return builder.as_markup()


# ---------------------------------------------------------------- Машины
def admin_cars_list_keyboard(language: Language, cars: list) -> InlineKeyboardMarkup:
    from app.callbacks.admin import AdminCarCallback

    builder = InlineKeyboardBuilder()
    builder.button(
        text=t("admin_car_create_btn", language),
        callback_data=AdminCarCallback(car_id=0, action="create"),
    )
    for car in cars:
        mark = "" if car.is_active else "🚫 "
        builder.button(
            text=f"{mark}🆔{car.id} {car.name}",
            callback_data=AdminCarCallback(car_id=car.id, action="view"),
        )
    builder.adjust(1)
    return builder.as_markup()


def admin_car_card_keyboard(language: Language, car) -> InlineKeyboardMarkup:
    from app.callbacks.admin import AdminCarCallback, AdminMenuCallback

    builder = InlineKeyboardBuilder()
    builder.button(
        text=t("admin_car_edit_btn", language),
        callback_data=AdminCarCallback(car_id=car.id, action="edit"),
    )
    if car.is_active:
        builder.button(
            text=t("admin_car_hide_btn", language),
            callback_data=AdminCarCallback(car_id=car.id, action="hide"),
        )
    else:
        builder.button(
            text=t("admin_car_restore_btn", language),
            callback_data=AdminCarCallback(car_id=car.id, action="restore"),
        )
    builder.button(text=t("btn_back", language), callback_data=AdminMenuCallback(section="cars"))
    builder.adjust(1)
    return builder.as_markup()


# ------------------------------------------------------------- Контейнеры
def admin_containers_list_keyboard(language: Language, containers: list) -> InlineKeyboardMarkup:
    from app.callbacks.admin import AdminContainerCallback

    builder = InlineKeyboardBuilder()
    builder.button(
        text=t("admin_container_create_btn", language),
        callback_data=AdminContainerCallback(container_id=0, action="create"),
    )
    for container in containers:
        mark = "" if container.is_enabled else "🔴 "
        builder.button(
            text=f"{mark}🆔{container.id} {container.name}",
            callback_data=AdminContainerCallback(container_id=container.id, action="view"),
        )
    builder.adjust(1)
    return builder.as_markup()


def admin_container_card_keyboard(language: Language, container) -> InlineKeyboardMarkup:
    from app.callbacks.admin import AdminContainerCallback, AdminMenuCallback

    builder = InlineKeyboardBuilder()
    for action, key in (
        ("edit", "admin_container_edit_btn"),
        ("add_car", "admin_container_add_car_btn"),
        ("remove_car", "admin_container_remove_car_btn"),
    ):
        builder.button(
            text=t(key, language),
            callback_data=AdminContainerCallback(container_id=container.id, action=action),
        )
    toggle_key = "admin_container_disable_btn" if container.is_enabled else "admin_container_enable_btn"
    builder.button(
        text=t(toggle_key, language),
        callback_data=AdminContainerCallback(container_id=container.id, action="toggle"),
    )
    builder.button(text=t("btn_back", language), callback_data=AdminMenuCallback(section="containers"))
    builder.adjust(1)
    return builder.as_markup()


# ------------------------------------------------------------------ Гараж
def admin_garage_keyboard(language: Language) -> InlineKeyboardMarkup:
    from app.callbacks.admin import AdminGarageCallback

    builder = InlineKeyboardBuilder()
    for action, key in (
        ("tier_add", "admin_garage_tier_add_btn"),
        ("tier_del", "admin_garage_tier_del_btn"),
        ("limits", "admin_garage_limits_btn"),
    ):
        builder.button(text=t(key, language), callback_data=AdminGarageCallback(action=action))
    builder.adjust(1)
    return builder.as_markup()


# ----------------------------------------------------------------- Магазин
def admin_shop_list_keyboard(language: Language, lots: list) -> InlineKeyboardMarkup:
    from app.callbacks.admin import AdminShopCallback

    builder = InlineKeyboardBuilder()
    builder.button(
        text=t("admin_shop_create_btn", language),
        callback_data=AdminShopCallback(lot_id=0, action="create"),
    )
    for lot in lots:
        mark = "" if lot.is_available else "🔴 "
        builder.button(
            text=f"{mark}🆔{lot.id} {lot.title}",
            callback_data=AdminShopCallback(lot_id=lot.id, action="view"),
        )
    builder.adjust(1)
    return builder.as_markup()


def admin_shop_lot_keyboard(language: Language, lot) -> InlineKeyboardMarkup:
    from app.callbacks.admin import AdminMenuCallback, AdminShopCallback

    builder = InlineKeyboardBuilder()
    builder.button(
        text=t("admin_shop_edit_btn", language),
        callback_data=AdminShopCallback(lot_id=lot.id, action="edit"),
    )
    builder.button(
        text=t("admin_shop_add_item_btn", language),
        callback_data=AdminShopCallback(lot_id=lot.id, action="add_item"),
    )
    toggle_key = "admin_shop_disable_btn" if lot.is_available else "admin_shop_enable_btn"
    builder.button(text=t(toggle_key, language), callback_data=AdminShopCallback(lot_id=lot.id, action="toggle"))
    builder.button(text=t("btn_back", language), callback_data=AdminMenuCallback(section="shop"))
    builder.adjust(1)
    return builder.as_markup()


# ------------------------------------------------------------- Battle Pass
def admin_bp_keyboard(language: Language, has_active: bool) -> InlineKeyboardMarkup:
    from app.callbacks.admin import AdminBpCallback

    builder = InlineKeyboardBuilder()
    if not has_active:
        builder.button(text=t("admin_bp_create_btn", language), callback_data=AdminBpCallback(action="create"))
    builder.button(text=t("admin_bp_add_level_btn", language), callback_data=AdminBpCallback(action="add_level"))
    builder.adjust(1)
    return builder.as_markup()


# -------------------------------------------------------------------- VIP
def admin_vip_keyboard(language: Language) -> InlineKeyboardMarkup:
    from app.callbacks.admin import AdminVipCallback

    builder = InlineKeyboardBuilder()
    builder.button(text=t("admin_vip_edit_btn", language), callback_data=AdminVipCallback(action="edit"))
    builder.adjust(1)
    return builder.as_markup()


# ---------------------------------------------------------------- Промокоды
def admin_promo_list_keyboard(language: Language, promos: list) -> InlineKeyboardMarkup:
    from app.callbacks.admin import AdminPromoCallback

    builder = InlineKeyboardBuilder()
    builder.button(
        text=t("admin_promo_create_btn", language),
        callback_data=AdminPromoCallback(promo_id=0, action="create"),
    )
    for promo in promos:
        mark = "" if promo.is_active else "🔴 "
        builder.button(text=f"{mark}{promo.code}", callback_data=AdminPromoCallback(promo_id=promo.id, action="view"))
    builder.adjust(1)
    return builder.as_markup()


def admin_promo_card_keyboard(language: Language, promo) -> InlineKeyboardMarkup:
    from app.callbacks.admin import AdminMenuCallback, AdminPromoCallback

    builder = InlineKeyboardBuilder()
    toggle_key = "admin_promo_disable_btn" if promo.is_active else "admin_promo_enable_btn"
    builder.button(text=t(toggle_key, language), callback_data=AdminPromoCallback(promo_id=promo.id, action="toggle"))
    builder.button(text=t("btn_back", language), callback_data=AdminMenuCallback(section="promo"))
    builder.adjust(1)
    return builder.as_markup()


# ------------------------------------------------------------------ Группы
def admin_groups_list_keyboard(language: Language, groups: list) -> InlineKeyboardMarkup:
    from app.callbacks.admin import AdminGroupCallback

    builder = InlineKeyboardBuilder()
    for group in groups:
        mark = "" if group.is_active else "🔴 "
        title = group.title or str(group.id)
        builder.button(text=f"{mark}{title}", callback_data=AdminGroupCallback(group_id=group.id, action="view"))
    builder.adjust(1)
    return builder.as_markup()


def admin_group_card_keyboard(language: Language, group) -> InlineKeyboardMarkup:
    from app.callbacks.admin import AdminGroupCallback, AdminMenuCallback

    builder = InlineKeyboardBuilder()
    toggle_key = "admin_group_disable_auction_btn" if group.auction_enabled else "admin_group_enable_auction_btn"
    builder.button(
        text=t(toggle_key, language), callback_data=AdminGroupCallback(group_id=group.id, action="toggle_auction")
    )
    builder.button(
        text=t("admin_group_remove_btn", language),
        callback_data=AdminGroupCallback(group_id=group.id, action="remove"),
    )
    builder.button(text=t("btn_back", language), callback_data=AdminMenuCallback(section="groups"))
    builder.adjust(1)
    return builder.as_markup()


# ------------------------------------------------------------ Администраторы
def admin_admins_list_keyboard(language: Language, admins: list) -> InlineKeyboardMarkup:
    from app.callbacks.admin import AdminAdminsCallback

    builder = InlineKeyboardBuilder()
    builder.button(text=t("admin_admins_add_btn", language), callback_data=AdminAdminsCallback(user_id=0, action="add"))
    for user_id, label in admins:
        builder.button(
            text=t("admin_admins_revoke_row", language, label=label),
            callback_data=AdminAdminsCallback(user_id=user_id, action="revoke"),
        )
    builder.adjust(1)
    return builder.as_markup()


# ------------------------------------------------------------- Документация
def admin_docs_list_keyboard(language: Language, sections: list[str]) -> InlineKeyboardMarkup:
    from app.callbacks.admin import AdminDocsCallback

    builder = InlineKeyboardBuilder()
    builder.button(
        text=t("admin_docs_create_btn", language),
        callback_data=AdminDocsCallback(section_key="", action="create"),
    )
    for key in sections:
        builder.button(text=key, callback_data=AdminDocsCallback(section_key=key, action="view"))
    builder.adjust(1)
    return builder.as_markup()


def admin_docs_section_keyboard(language: Language, section_key: str) -> InlineKeyboardMarkup:
    from app.callbacks.admin import AdminDocsCallback, AdminMenuCallback

    builder = InlineKeyboardBuilder()
    builder.button(
        text=t("admin_docs_edit_btn", language), callback_data=AdminDocsCallback(section_key=section_key, action="edit")
    )
    builder.button(
        text=t("admin_docs_delete_btn", language),
        callback_data=AdminDocsCallback(section_key=section_key, action="delete"),
    )
    builder.button(text=t("btn_back", language), callback_data=AdminMenuCallback(section="documentation"))
    builder.adjust(1)
    return builder.as_markup()


# ------------------------------------------------------------------ База данных
def admin_database_keyboard(language: Language) -> InlineKeyboardMarkup:
    from app.callbacks.admin import AdminDatabaseCallback

    builder = InlineKeyboardBuilder()
    builder.button(text=t("admin_db_export_btn", language), callback_data=AdminDatabaseCallback(action="export"))
    builder.button(
        text=t("admin_db_import_btn", language), callback_data=AdminDatabaseCallback(action="import_prompt")
    )
    builder.adjust(1)
    return builder.as_markup()


def admin_database_confirm_keyboard(language: Language) -> InlineKeyboardMarkup:
    from app.callbacks.admin import AdminDatabaseCallback

    builder = InlineKeyboardBuilder()
    builder.button(text=t("btn_confirm", language), callback_data=AdminDatabaseCallback(action="import_confirm"))
    builder.button(text=t("btn_cancel", language), callback_data=AdminDatabaseCallback(action="import_cancel"))
    builder.adjust(2)
    return builder.as_markup()


# ---------------------------------------------------------------- Рассылки
def admin_broadcasts_list_keyboard(language: Language, broadcasts: list) -> InlineKeyboardMarkup:
    from app.callbacks.admin import AdminBroadcastCallback

    builder = InlineKeyboardBuilder()
    builder.button(
        text=t("admin_bc_create_btn", language),
        callback_data=AdminBroadcastCallback(broadcast_id=0, action="create"),
    )
    for broadcast in broadcasts:
        label = (broadcast.text or "—")[:30]
        builder.button(
            text=f"🆔{broadcast.id} {broadcast.status.value} · {label}",
            callback_data=AdminBroadcastCallback(broadcast_id=broadcast.id, action="view"),
        )
    builder.adjust(1)
    return builder.as_markup()


def admin_broadcast_card_keyboard(language: Language, broadcast) -> InlineKeyboardMarkup:
    from app.callbacks.admin import AdminBroadcastCallback, AdminMenuCallback

    builder = InlineKeyboardBuilder()
    if broadcast.status.value in ("scheduled", "draft"):
        builder.button(
            text=t("admin_bc_stop_btn", language),
            callback_data=AdminBroadcastCallback(broadcast_id=broadcast.id, action="stop"),
        )
    builder.button(
        text=t("admin_bc_delete_btn", language),
        callback_data=AdminBroadcastCallback(broadcast_id=broadcast.id, action="delete"),
    )
    builder.button(text=t("btn_back", language), callback_data=AdminMenuCallback(section="broadcasts"))
    builder.adjust(1)
    return builder.as_markup()


def admin_broadcast_audience_keyboard(language: Language) -> InlineKeyboardMarkup:
    from app.callbacks.admin import AdminBroadcastAudienceCallback
    from app.core.enums import BroadcastAudience

    labels = {
        BroadcastAudience.ALL: "admin_bc_aud_all",
        BroadcastAudience.RU: "admin_bc_aud_ru",
        BroadcastAudience.EN: "admin_bc_aud_en",
        BroadcastAudience.VIP: "admin_bc_aud_vip",
        BroadcastAudience.REGULAR: "admin_bc_aud_regular",
        BroadcastAudience.ACTIVE: "admin_bc_aud_active",
        BroadcastAudience.INACTIVE: "admin_bc_aud_inactive",
    }
    builder = InlineKeyboardBuilder()
    for audience, key in labels.items():
        builder.button(text=t(key, language), callback_data=AdminBroadcastAudienceCallback(audience=audience.value))
    builder.adjust(2)
    return builder.as_markup()


def admin_broadcast_schedule_keyboard(language: Language) -> InlineKeyboardMarkup:
    from app.callbacks.admin import AdminBroadcastScheduleCallback

    builder = InlineKeyboardBuilder()
    for schedule_type, key in (
        ("now", "admin_bc_sched_now"), ("daily", "admin_bc_sched_daily"), ("weekly", "admin_bc_sched_weekly"),
    ):
        builder.button(
            text=t(key, language), callback_data=AdminBroadcastScheduleCallback(schedule_type=schedule_type)
        )
    builder.adjust(1)
    return builder.as_markup()


def admin_stats_keyboard(language: Language, current: str) -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    for period in ("day", "week", "month", "all"):
        mark = "• " if period == current else ""
        builder.button(
            text=mark + t(f"admin_stats_period_{period}", language),
            callback_data=AdminStatsCallback(period=period),
        )
    builder.adjust(4)
    return builder.as_markup()


def admin_history_keyboard(
    language: Language, user_id: int, page: int, has_next: bool
) -> InlineKeyboardMarkup:
    from app.callbacks.admin import AdminHistoryCallback

    builder = InlineKeyboardBuilder()
    if page > 0:
        builder.button(
            text="⬅️", callback_data=AdminHistoryCallback(user_id=user_id, page=page - 1)
        )
    if has_next:
        builder.button(
            text="➡️", callback_data=AdminHistoryCallback(user_id=user_id, page=page + 1)
        )
    builder.adjust(2)
    builder.row(
        InlineKeyboardButton(
            text=t("btn_back", language),
            callback_data=AdminUserCallback(user_id=user_id, action="view").pack(),
        )
    )
    return builder.as_markup()


def admin_backups_keyboard(language: Language, enabled: bool) -> InlineKeyboardMarkup:
    from app.callbacks.admin import AdminBackupCallback

    builder = InlineKeyboardBuilder()
    builder.button(text=t("admin_bkp_create_btn", language), callback_data=AdminBackupCallback(action="create"))
    builder.button(
        text=t("admin_bkp_off_btn" if enabled else "admin_bkp_on_btn", language),
        callback_data=AdminBackupCallback(action="toggle"),
    )
    builder.button(text=t("admin_bkp_hour_btn", language) + " −", callback_data=AdminBackupCallback(action="hour_down"))
    builder.button(text=t("admin_bkp_hour_btn", language) + " +", callback_data=AdminBackupCallback(action="hour_up"))
    builder.button(text=t("admin_bkp_keep_btn", language) + " −", callback_data=AdminBackupCallback(action="keep_down"))
    builder.button(text=t("admin_bkp_keep_btn", language) + " +", callback_data=AdminBackupCallback(action="keep_up"))
    builder.adjust(1, 1, 2, 2)
    return builder.as_markup()


def admin_skills_keyboard(language: Language, skills: list) -> InlineKeyboardMarkup:
    from app.callbacks.admin import AdminSkillCallback

    builder = InlineKeyboardBuilder()
    for skill in skills:
        builder.button(
            text=f"#{skill.id} {skill.name}",
            callback_data=AdminSkillCallback(skill_id=skill.id, action="view"),
        )
    builder.button(text=t("admin_skill_create_btn", language), callback_data=AdminMenuCallback(section="skills_create"))
    builder.adjust(1)
    return builder.as_markup()


def admin_skill_card_keyboard(language: Language, skill) -> InlineKeyboardMarkup:
    from app.callbacks.admin import AdminSkillCallback

    builder = InlineKeyboardBuilder()
    builder.button(text=t("admin_skill_delete_btn", language), callback_data=AdminSkillCallback(skill_id=skill.id, action="delete"))
    builder.button(text=t("btn_back", language), callback_data=AdminMenuCallback(section="skills"))
    builder.adjust(1)
    return builder.as_markup()
