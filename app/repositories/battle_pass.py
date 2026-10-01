"""Доступ к Battle Pass: BattlePass, BattlePassLevel, BattlePassReward, BattlePassProgress."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import select, update

from app.models.battle_pass import BattlePass
from app.models.battle_pass_level import BattlePassLevel
from app.models.battle_pass_progress import BattlePassProgress
from app.models.battle_pass_reward import BattlePassReward
from app.repositories.base import BaseRepository


class BattlePassRepository(BaseRepository[BattlePass]):
    model = BattlePass

    async def get_active(self) -> BattlePass | None:
        stmt = select(BattlePass).where(BattlePass.is_active.is_(True)).order_by(BattlePass.id.desc()).limit(1)
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def list_all(self) -> list[BattlePass]:
        stmt = select(BattlePass).order_by(BattlePass.id.desc())
        return list((await self.session.execute(stmt)).scalars())

    async def create(self, **fields) -> BattlePass:
        bp = BattlePass(**fields)
        self.add(bp)
        return bp

    async def update_fields(self, bp_id: int, **fields) -> None:
        if fields:
            await self.session.execute(update(BattlePass).where(BattlePass.id == bp_id).values(**fields))


class BattlePassLevelRepository(BaseRepository[BattlePassLevel]):
    model = BattlePassLevel

    async def list_for_pass(self, battle_pass_id: int) -> list[BattlePassLevel]:
        stmt = (
            select(BattlePassLevel)
            .where(BattlePassLevel.battle_pass_id == battle_pass_id)
            .order_by(BattlePassLevel.level_number)
        )
        return list((await self.session.execute(stmt)).scalars())

    async def get_by_number(self, battle_pass_id: int, level_number: int) -> BattlePassLevel | None:
        stmt = select(BattlePassLevel).where(
            BattlePassLevel.battle_pass_id == battle_pass_id,
            BattlePassLevel.level_number == level_number,
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def create(self, battle_pass_id: int, level_number: int) -> BattlePassLevel:
        level = BattlePassLevel(battle_pass_id=battle_pass_id, level_number=level_number)
        self.add(level)
        return level


class BattlePassRewardRepository(BaseRepository[BattlePassReward]):
    model = BattlePassReward

    async def list_for_level(self, level_id: int) -> list[BattlePassReward]:
        stmt = select(BattlePassReward).where(BattlePassReward.level_id == level_id)
        return list((await self.session.execute(stmt)).scalars())

    async def add_reward(self, level_id: int, reward_type, payload: dict) -> BattlePassReward:
        reward = BattlePassReward(level_id=level_id, reward_type=reward_type, payload=payload)
        self.add(reward)
        return reward


class BattlePassProgressRepository(BaseRepository[BattlePassProgress]):
    model = BattlePassProgress

    async def find_by_user_and_pass(self, user_id: int, battle_pass_id: int) -> BattlePassProgress | None:
        stmt = select(BattlePassProgress).where(
            BattlePassProgress.user_id == user_id, BattlePassProgress.battle_pass_id == battle_pass_id
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def get_or_create(self, user_id: int, battle_pass_id: int) -> BattlePassProgress:
        progress = await self.find_by_user_and_pass(user_id, battle_pass_id)
        if progress is None:
            progress = BattlePassProgress(user_id=user_id, battle_pass_id=battle_pass_id)
            self.add(progress)
            await self.flush()
        return progress

    async def mark_purchased(self, progress_id: int, when: dt.datetime) -> None:
        await self.session.execute(
            update(BattlePassProgress).where(BattlePassProgress.id == progress_id).values(purchased_at=when)
        )

    async def mark_opened_container_today(self, progress_id: int) -> None:
        await self.session.execute(
            update(BattlePassProgress)
            .where(BattlePassProgress.id == progress_id)
            .values(opened_container_today=True)
        )

    async def level_up(self, progress_id: int, new_level: int, day: dt.date) -> None:
        await self.session.execute(
            update(BattlePassProgress)
            .where(BattlePassProgress.id == progress_id)
            .values(current_level=new_level, last_level_up_date=day, opened_container_today=False)
        )
