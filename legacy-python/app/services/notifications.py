"""Настройки уведомлений: по умолчанию включены у всех, кроме владельца."""
from __future__ import annotations

from sqlalchemy import select

from app.config.settings import settings
from app.models.user_settings import UserSetting
from app.repositories.user import UserSettingRepository

FOOTER = "\n\n🔕 Выключить: ⚙️ Настройки → 🔔 Уведомления"


async def notif_enabled(session, user_id: int, kind: str) -> bool:
    if user_id == settings.owner_id:
        return False
    val = await UserSettingRepository(session).get_value(user_id, "notif")
    return not (isinstance(val, dict) and val.get(kind) is False)


async def filter_news(session, user_ids: list[int]) -> list[int]:
    rows = (await session.execute(select(UserSetting).where(UserSetting.key == "notif"))).scalars()
    off = {r.user_id for r in rows if isinstance(r.value, dict) and r.value.get("news") is False}
    off.add(settings.owner_id)
    return [u for u in user_ids if u not in off]
