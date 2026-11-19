"""Проверка прав: владелец бота (settings.owner_id) и администраторы.

Владелец всегда имеет полный доступ и не обязан иметь запись в таблице
admins. Права администраторов — JSON-словарь Admin.permissions с ключами
из app.models.admin.ADMIN_PERMISSION_KEYS (users, economy, cars, containers,
garage, shop, battle_pass, vip, promo, groups, broadcasts, statistics,
documentation, backups, admins)."""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import settings
from app.models.admin import ADMIN_PERMISSION_KEYS, Admin
from app.repositories.user import AdminRepository


def is_owner(user_id: int) -> bool:
    return user_id == settings.owner_id


async def get_admin(session: AsyncSession, user_id: int) -> Admin | None:
    """Запись администратора, если она есть и активна. Для владельца всегда
    None — у него права проверяются отдельно через is_owner()/is_admin()."""
    repo = AdminRepository(session)
    admin = await repo.get_by_user_id(user_id)
    return admin if admin is not None and admin.is_active else None


async def is_admin(session: AsyncSession, user_id: int) -> bool:
    if is_owner(user_id):
        return True
    return await get_admin(session, user_id) is not None


async def has_permission(session: AsyncSession, user_id: int, permission_key: str) -> bool:
    if permission_key not in ADMIN_PERMISSION_KEYS:
        raise ValueError(f"Неизвестный ключ права администратора: {permission_key}")
    if is_owner(user_id):
        return True
    admin = await get_admin(session, user_id)
    if admin is None:
        return False
    return bool(admin.permissions.get(permission_key, False))
