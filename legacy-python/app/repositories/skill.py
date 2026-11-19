"""Доступ к навыкам: Skill, UserSkill."""
from __future__ import annotations

from sqlalchemy import select, update

from app.models.skill import Skill
from app.models.user_skill import UserSkill
from app.repositories.base import BaseRepository


class SkillRepository(BaseRepository[Skill]):
    model = Skill

    async def list_all(self) -> list[Skill]:
        stmt = select(Skill)
        return list((await self.session.execute(stmt)).scalars())

    async def create(self, **fields) -> Skill:
        skill = Skill(**fields)
        self.add(skill)
        return skill


class UserSkillRepository(BaseRepository[UserSkill]):
    model = UserSkill

    async def get_for_user(self, user_id: int, skill_id: int) -> UserSkill | None:
        stmt = select(UserSkill).where(UserSkill.user_id == user_id, UserSkill.skill_id == skill_id)
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def list_for_user(self, user_id: int) -> list[UserSkill]:
        stmt = select(UserSkill).where(UserSkill.user_id == user_id)
        return list((await self.session.execute(stmt)).scalars())

    async def upsert_level(self, user_id: int, skill_id: int, level: int) -> UserSkill:
        existing = await self.get_for_user(user_id, skill_id)
        if existing is None:
            existing = UserSkill(user_id=user_id, skill_id=skill_id, level=level)
            self.add(existing)
        else:
            existing.level = level
        return existing
