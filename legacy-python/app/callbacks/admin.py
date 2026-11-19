"""CallbackData для админ-панели."""
from __future__ import annotations

from aiogram.filters.callback_data import CallbackData


class AdminMenuCallback(CallbackData, prefix="admin_menu"):
    section: str  # "users" | "cars" | "containers" | ...


class AdminUserCallback(CallbackData, prefix="admin_user"):
    user_id: int
    action: str  # "view" | "ban" | "unban" | "vip_grant" | "vip_revoke" | "balance_prompt"


class AdminCarCallback(CallbackData, prefix="admin_car"):
    car_id: int
    action: str  # "view" | "create" | "edit" | "hide" | "restore"


class AdminContainerCallback(CallbackData, prefix="admin_cont"):
    container_id: int
    action: str  # "view" | "create" | "edit" | "toggle" | "add_car" | "remove_car"


class AdminGarageCallback(CallbackData, prefix="admin_garage"):
    action: str  # "tier_add" | "tier_del" | "limits"


class AdminShopCallback(CallbackData, prefix="admin_shop"):
    lot_id: int
    action: str  # "view" | "create" | "edit" | "toggle" | "add_item" | "clear_items"


class AdminBpCallback(CallbackData, prefix="admin_bp"):
    action: str  # "view" | "create" | "activate" | "add_level"


class AdminVipCallback(CallbackData, prefix="admin_vip_cfg"):
    action: str  # "edit"


class AdminPromoCallback(CallbackData, prefix="admin_promo"):
    promo_id: int
    action: str  # "view" | "create" | "toggle"


class AdminGroupCallback(CallbackData, prefix="admin_group"):
    group_id: int
    action: str  # "view" | "toggle_auction" | "remove"


class AdminAdminsCallback(CallbackData, prefix="admin_admins"):
    user_id: int
    action: str  # "revoke"


class AdminDocsCallback(CallbackData, prefix="admin_docs"):
    section_key: str
    action: str  # "view" | "create" | "edit" | "delete"


class AdminDatabaseCallback(CallbackData, prefix="admin_db"):
    action: str  # "export" | "import_prompt" | "import_confirm" | "import_cancel"


class AdminBroadcastCallback(CallbackData, prefix="admin_bc"):
    broadcast_id: int
    action: str  # "view" | "create" | "stop" | "delete"


class AdminBroadcastAudienceCallback(CallbackData, prefix="admin_bc_aud"):
    audience: str


class AdminBroadcastScheduleCallback(CallbackData, prefix="admin_bc_sched"):
    schedule_type: str  # "now" | "daily" | "weekly"


class AdminStatsCallback(CallbackData, prefix="admin_stats"):
    period: str  # "day" | "week" | "month" | "all"


class AdminHistoryCallback(CallbackData, prefix="admin_hist"):
    user_id: int
    page: int


class AdminBackupCallback(CallbackData, prefix="admin_bkp"):
    action: str  # "create" | "toggle" | "hour_up" | "hour_down" | "keep_up" | "keep_down"


class AdminSkillCallback(CallbackData, prefix="admin_skill"):
    skill_id: int
    action: str  # "view" | "delete"
