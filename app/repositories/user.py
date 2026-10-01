"""Доступ к данным игроков: User, Admin, UserSetting, UserStats."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.core.enums import BroadcastAudience, Language

from app.models.admin import Admin
from app.models.user import User
from app.models.user_settings import UserSetting
from app.models.user_stats import UserStats
from app.repositories.base import BaseRepository
from app.repositories.history import record_event


class UserRepository(BaseRepository[User]):
    model = User

    async def get_by_username(self, username: str) -> User | None:
        stmt = select(User).where(User.username == username.lstrip("@"))
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def get_or_none(self, user_id: int) -> User | None:
        return await self.get(user_id)

    async def create(self, user_id: int, username: str | None, first_name: str | None, language: str) -> User:
        user = User(id=user_id, username=username, first_name=first_name, language=language)
        self.add(user)
        record_event(self.session, user_id, "registered", {"language": str(getattr(language, "value", language))})
        return user

    async def update_profile(self, user_id: int, username: str | None, first_name: str | None) -> None:
        await self.session.execute(
            update(User).where(User.id == user_id).values(username=username, first_name=first_name)
        )

    async def increment_balance(self, user_id: int, delta: int) -> int:
        """Атомарный инкремент баланса на уровне БД (UPDATE ... RETURNING).
        Не проверяет отрицательный баланс — эта проверка делается в сервисе
        ДО вызова, внутри distributed_lock/atomic (см. database/transaction.py)."""
        stmt = (
            update(User)
            .where(User.id == user_id)
            .values(balance=User.balance + delta)
            .returning(User.balance)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one()

    async def set_language(self, user_id: int, language: str) -> None:
        await self.session.execute(update(User).where(User.id == user_id).values(language=language))
        record_event(self.session, user_id, "language_changed", {"language": str(getattr(language, "value", language))})

    async def set_vip(self, user_id: int, is_vip: bool, since: dt.datetime | None = None) -> None:
        values = {"is_vip": is_vip}
        if since is not None:
            values["vip_since"] = since
        await self.session.execute(update(User).where(User.id == user_id).values(**values))
        record_event(self.session, user_id, "vip_granted" if is_vip else "vip_revoked", {})

    async def set_banned(self, user_id: int, is_banned: bool, reason: str | None = None) -> None:
        await self.session.execute(
            update(User).where(User.id == user_id).values(is_banned=is_banned, ban_reason=reason)
        )

    async def set_agreed_to_docs(self, user_id: int, when: dt.datetime) -> None:
        await self.session.execute(
            update(User).where(User.id == user_id).values(agreed_to_docs=True, agreed_at=when)
        )
        record_event(self.session, user_id, "agreed_docs", {})

    async def set_last_daily_bonus_date(self, user_id: int, day: dt.date) -> None:
        await self.session.execute(
            update(User).where(User.id == user_id).values(last_daily_bonus_date=day)
        )

    async def top_rich(self, limit: int = 15, group_user_ids: list[int] | None = None) -> list[User]:
        stmt = select(User).where(User.is_banned.is_(False)).order_by(User.balance.desc()).limit(limit)
        if group_user_ids is not None:
            stmt = stmt.where(User.id.in_(group_user_ids))
        return list((await self.session.execute(stmt)).scalars())

    async def touch_last_seen(self, user_id: int, when: dt.datetime) -> None:
        await self.session.execute(update(User).where(User.id == user_id).values(last_seen_at=when))

    async def list_ids_for_broadcast(
        self, audience: BroadcastAudience, active_cutoff: dt.datetime,
    ) -> list[int]:
        """Аудитория рассылки (раздел 25 ТЗ): все/RU/EN/VIP/обычные/
        активные/неактивные. CUSTOM (произвольный сегмент) в этой версии
        не поддержан — обрабатывается как ALL, дополнительные фильтры
        можно добавить позже через Broadcast.audience_filter."""
        stmt = select(User.id).where(User.is_banned.is_(False))
        if audience is BroadcastAudience.RU:
            stmt = stmt.where(User.language == Language.RU)
        elif audience is BroadcastAudience.EN:
            stmt = stmt.where(User.language == Language.EN)
        elif audience is BroadcastAudience.VIP:
            stmt = stmt.where(User.is_vip.is_(True))
        elif audience is BroadcastAudience.REGULAR:
            stmt = stmt.where(User.is_vip.is_(False))
        elif audience is BroadcastAudience.ACTIVE:
            stmt = stmt.where(User.last_seen_at.is_not(None), User.last_seen_at >= active_cutoff)
        elif audience is BroadcastAudience.INACTIVE:
            stmt = stmt.where(
                (User.last_seen_at.is_(None)) | (User.last_seen_at < active_cutoff)
            )
        return list((await self.session.execute(stmt)).scalars())

    async def search(self, query: str) -> list[User]:
        """Поиск по Telegram ID (если query — число) или по username (для админки)."""
        if query.isdigit():
            stmt = select(User).where(User.id == int(query))
        else:
            stmt = select(User).where(User.username.ilike(f"%{query.lstrip('@')}%"))
        return list((await self.session.execute(stmt)).scalars())


class AdminRepository(BaseRepository[Admin]):
    model = Admin

    async def get_by_user_id(self, user_id: int) -> Admin | None:
        return await self.get(user_id)

    async def list_active(self) -> list[Admin]:
        stmt = select(Admin).where(Admin.is_active.is_(True))
        return list((await self.session.execute(stmt)).scalars())

    async def upsert(self, user_id: int, permissions: dict, granted_by: int, when: dt.datetime) -> Admin:
        admin = await self.get(user_id)
        if admin is None:
            admin = Admin(
                user_id=user_id, permissions=permissions, granted_by=granted_by,
                is_active=True, granted_at=when,
            )
            self.add(admin)
        else:
            admin.permissions = permissions
            admin.granted_by = granted_by
            admin.is_active = True
            admin.granted_at = when
        return admin

    async def revoke(self, user_id: int) -> None:
        await self.session.execute(update(Admin).where(Admin.user_id == user_id).values(is_active=False))


class UserSettingRepository(BaseRepository[UserSetting]):
    model = UserSetting

    async def get_value(self, user_id: int, key: str):
        stmt = select(UserSetting).where(UserSetting.user_id == user_id, UserSetting.key == key)
        row = (await self.session.execute(stmt)).scalar_one_or_none()
        return row.value if row else None

    async def set_value(self, user_id: int, key: str, value) -> None:
        stmt = select(UserSetting).where(UserSetting.user_id == user_id, UserSetting.key == key)
        row = (await self.session.execute(stmt)).scalar_one_or_none()
        if row is None:
            self.add(UserSetting(user_id=user_id, key=key, value=value))
        else:
            row.value = value

    async def list_for_user(self, user_id: int) -> list[UserSetting]:
        stmt = select(UserSetting).where(UserSetting.user_id == user_id)
        return list((await self.session.execute(stmt)).scalars())


class UserStatsRepository(BaseRepository[UserStats]):
    model = UserStats

    async def get_or_create(self, user_id: int) -> UserStats:
        stats = await self.get(user_id)
        if stats is None:
            stats = UserStats(user_id=user_id)
            self.add(stats)
            await self.flush()
        return stats

    async def increment(self, user_id: int, **fields: int) -> None:
        """increment(user_id, wins=1, cars_obtained=1) -> UPDATE user_stats SET
        wins = wins + 1, cars_obtained = cars_obtained + 1 ..."""
        if not fields:
            return
        # Строка статистики создаётся лениво — без этого UPDATE молча ничего
        # не менял бы для игроков, ни разу не открывавших экран статистики.
        await self.session.execute(
            pg_insert(UserStats).values(user_id=user_id).on_conflict_do_nothing(index_elements=["user_id"])
        )
        values = {col: getattr(UserStats, col) + delta for col, delta in fields.items()}
        await self.session.execute(update(UserStats).where(UserStats.user_id == user_id).values(**values))

    async def top_by_wins(self, limit: int = 15) -> list[UserStats]:
        stmt = select(UserStats).order_by(UserStats.wins.desc()).limit(limit)
        return list((await self.session.execute(stmt)).scalars())

    async def top_by_container_profit(self, limit: int = 15) -> list[UserStats]:
        stmt = select(UserStats).order_by(UserStats.container_profit.desc()).limit(limit)
        return list((await self.session.execute(stmt)).scalars())
