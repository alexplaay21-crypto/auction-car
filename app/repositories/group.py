"""Доступ к данным групп: Group, GroupMember."""
from __future__ import annotations

from sqlalchemy import func, select, update

from app.models.group import Group
from app.models.group_member import GroupMember
from app.repositories.base import BaseRepository


class GroupRepository(BaseRepository[Group]):
    model = Group

    async def upsert(self, group_id: int, title: str | None, added_by: int, language: str) -> Group:
        group = await self.get(group_id)
        if group is None:
            group = Group(id=group_id, title=title, added_by=added_by, language=language)
            self.add(group)
        else:
            group.title = title
            group.is_active = True
        return group

    async def set_auction_enabled(self, group_id: int, enabled: bool) -> None:
        await self.session.execute(update(Group).where(Group.id == group_id).values(auction_enabled=enabled))

    async def set_language(self, group_id: int, language: str) -> None:
        await self.session.execute(update(Group).where(Group.id == group_id).values(language=language))

    async def deactivate(self, group_id: int) -> None:
        await self.session.execute(update(Group).where(Group.id == group_id).values(is_active=False))

    async def list_all(self, limit: int = 50) -> list[Group]:
        """Все группы, включая неактивные (для админки)."""
        stmt = select(Group).order_by(Group.id.desc()).limit(limit)
        return list((await self.session.execute(stmt)).scalars())

    async def activate(self, group_id: int) -> None:
        await self.session.execute(update(Group).where(Group.id == group_id).values(is_active=True))

    async def list_active(self) -> list[Group]:
        stmt = select(Group).where(Group.is_active.is_(True))
        return list((await self.session.execute(stmt)).scalars())


class GroupMemberRepository(BaseRepository[GroupMember]):
    model = GroupMember

    async def ensure_member(self, group_id: int, user_id: int) -> None:
        stmt = select(GroupMember).where(GroupMember.group_id == group_id, GroupMember.user_id == user_id)
        exists = (await self.session.execute(stmt)).scalar_one_or_none()
        if exists is None:
            self.add(GroupMember(group_id=group_id, user_id=user_id))

    async def is_member(self, group_id: int, user_id: int) -> bool:
        stmt = select(GroupMember.id).where(GroupMember.group_id == group_id, GroupMember.user_id == user_id)
        return (await self.session.execute(stmt)).scalar_one_or_none() is not None

    async def member_user_ids(self, group_id: int) -> list[int]:
        stmt = select(GroupMember.user_id).where(GroupMember.group_id == group_id)
        return list((await self.session.execute(stmt)).scalars())

    async def count_members(self, group_id: int) -> int:
        stmt = select(func.count()).select_from(GroupMember).where(GroupMember.group_id == group_id)
        return (await self.session.execute(stmt)).scalar_one()
