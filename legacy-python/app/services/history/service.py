"""Чтение и форматирование истории игрока (раздел 27 ТЗ). Запись событий
идёт из репозиториев/сервисов через repositories.history.record_event —
в той же транзакции, что и сама операция."""
from __future__ import annotations

from html import escape

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import Language, TransactionType
from app.localization.manager import t
from app.models.history import HistoryEvent
from app.repositories.history import HistoryRepository

PAGE_SIZE = 10

EVENT_TYPES = (
    "registered", "language_changed", "agreed_docs", "bet", "container_won",
    "car_obtained", "car_sold", "car_given", "car_received", "promo_redeemed",
    "referral_invited", "referral_joined", "shop_purchase", "vip_granted",
    "vip_revoked", "bp_level_up", "admin_balance", "admin_ban", "admin_unban",
    "admin_vip_grant", "admin_vip_revoke", "system_error", "container_received",
    "container_removed", "container_opened", "admin_car_give", "admin_car_take",
    "admin_container_give", "admin_container_take", "admin_bp_give", "admin_skill_give",
    "admin_garage_capacity",
) + tuple(f"money_{tx.value}" for tx in TransactionType)

_MONEY_KEYS = ("amount", "delta", "bid", "price", "balance_after")
_ID_KEYS = (
    ("auction_id", "🔨"), ("user_car_id", "🚗"), ("car_id", "🆔"), ("lot_id", "🛒"),
    ("purchase_id", "🧾"), ("invited_id", "👤"), ("inviter_id", "👤"), ("level", "🎫"),
)


def _fmt_money(value: int) -> str:
    sign = "-" if value < 0 else ""
    return f"{sign}${abs(int(value)):,}".replace(",", " ")


def _details(payload: dict) -> str:
    parts: list[str] = []
    for key in _MONEY_KEYS:
        if isinstance(payload.get(key), int):
            prefix = "→ " if key == "balance_after" else ""
            parts.append(prefix + _fmt_money(payload[key]))
    for key, icon in _ID_KEYS:
        if payload.get(key) is not None:
            parts.append(f"{icon}{payload[key]}")
    return " ".join(parts)


def format_event(event: HistoryEvent, language: Language) -> str:
    key = f"hist_{event.event_type}"
    label = t(key, language) if event.event_type in EVENT_TYPES else escape(event.event_type)
    stamp = event.created_at.strftime("%d.%m %H:%M") if event.created_at else "—"
    line = f"{stamp} · {label}"
    details = _details(event.payload or {})
    if details:
        line += f" · {details}"
    if event.actor_admin_id:
        line += f" · 🛡{event.actor_admin_id}"
    if event.operation_id:
        line += f" · #{event.operation_id[:8]}"
    return line


class HistoryService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def page(self, user_id: int, page: int, language: Language) -> tuple[str, int, bool]:
        """(текст страницы, всего событий, есть ли следующая страница)."""
        repo = HistoryRepository(self.session)
        total = await repo.count_for_user(user_id)
        events = await repo.list_for_user(user_id, limit=PAGE_SIZE, offset=page * PAGE_SIZE)
        if not events:
            return t("admin_history_empty", language), total, False
        text = "\n".join(format_event(e, language) for e in events)
        return text, total, (page + 1) * PAGE_SIZE < total
