"""Ежедневный прогресс уровня Battle Pass (раздел 22 ТЗ): игрок начинает с
0 уровня и может перейти на следующий не чаще раза в игровой день (00:00
UTC), при условии что в этот день открыл хотя бы один контейнер
(ежедневный контейнер тоже считается — просто 'контейнер открыт', без
разбора источника). Один уровень нельзя получить дважды — это
гарантирует last_level_up_date."""
from __future__ import annotations

import datetime as dt

from sqlalchemy.ext.asyncio import AsyncSession

from app.utils.dates import current_game_day  # noqa: F401
from app.database.transaction import atomic, distributed_lock
from app.repositories.history import record_event
from app.repositories.battle_pass import BattlePassProgressRepository, BattlePassRepository


class BattlePassProgressService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def mark_container_opened(self, user_id: int, when: dt.datetime) -> None:
        """Вызывается из Auctions при открытии контейнера. Если у игрока
        есть купленный активный BP и он ещё не поднимал уровень сегодня —
        поднимает уровень и выдаёт награды этого уровня."""
        bp = await BattlePassRepository(self.session).get_active()
        if bp is None:
            return

        progress_repo = BattlePassProgressRepository(self.session)
        progress = await progress_repo.find_by_user_and_pass(user_id, bp.id)
        if progress is None or progress.purchased_at is None:
            return  # BP этим игроком не куплен — прогресса нет

        today = current_game_day(when)
        new_level: int | None = None

        async with distributed_lock(f"bp_progress:{progress.id}"):
            async with atomic(self.session):
                if progress.last_level_up_date == today:
                    return  # уже поднимался сегодня
                if progress.current_level >= bp.levels_count:
                    return  # достигнут максимум уровней

                new_level = progress.current_level + 1
                await progress_repo.level_up(progress.id, new_level, today)
                record_event(
                    self.session, user_id, "bp_level_up",
                    {"battle_pass_id": bp.id, "level": new_level},
                )

        if new_level is None:
            return

        progress.current_level = new_level
        progress.last_level_up_date = today
        progress.opened_container_today = False

        from app.services.battle_pass.service import BattlePassService  # без цикла импортов

        await BattlePassService(self.session).grant_level_rewards(user_id, bp.id, new_level)
