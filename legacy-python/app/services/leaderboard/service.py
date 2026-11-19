"""Лидерборды (раздел 20 ТЗ): глобальные (топ богатых, топ гонщиков —
по числу побед, топ по профиту от контейнеров) и групповой (топ 15 по
балансу среди участников конкретной группы)."""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import GROUP_TOP_SIZE
from app.models.user import User
from app.models.user_stats import UserStats
from app.repositories.group import GroupMemberRepository
from app.repositories.user import UserRepository, UserStatsRepository

GLOBAL_TOP_SIZE = 15


class LeaderboardService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def top_rich_global(self) -> list[User]:
        return await UserRepository(self.session).top_rich(limit=GLOBAL_TOP_SIZE)

    async def top_racers_global(self) -> list[tuple[User, UserStats]]:
        stats_rows = await UserStatsRepository(self.session).top_by_wins(GLOBAL_TOP_SIZE)
        return await self._join_users(stats_rows)

    async def top_container_profit_global(self) -> list[tuple[User, UserStats]]:
        stats_rows = await UserStatsRepository(self.session).top_by_container_profit(GLOBAL_TOP_SIZE)
        return await self._join_users(stats_rows)

    async def top_rich_group(self, group_id: int) -> list[User]:
        member_ids = await GroupMemberRepository(self.session).member_user_ids(group_id)
        if not member_ids:
            return []
        return await UserRepository(self.session).top_rich(limit=GROUP_TOP_SIZE, group_user_ids=member_ids)

    async def _join_users(self, stats_rows: list[UserStats]) -> list[tuple[User, UserStats]]:
        user_repo = UserRepository(self.session)
        result: list[tuple[User, UserStats]] = []
        for stats in stats_rows:
            user = await user_repo.get(stats.user_id)
            if user is not None:
                result.append((user, stats))
        return result
