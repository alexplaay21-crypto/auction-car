"""Восстановление активных аукционов после рестарта процесса/сервера
(раздел 28 ТЗ): 'текущая ставка не теряется, участники не теряются,
победитель не теряется, таймер корректно восстанавливается'.

Поскольку всё состояние (current_bid, current_leader_id, ends_at, статус)
хранится в PostgreSQL, а не в памяти процесса или в Redis, восстановление
сводится к одному проходу: завершить всё, что успело истечь, пока бот был
недоступен, и продолжить обычный цикл (services/auctions/timer.py) —
никакого специального 'снимка' состояния не требуется."""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.config.logging import get_logger
from app.services.auctions.service import AuctionService, FinalizeResult
from app.services.auctions.timer import due_auctions

logger = get_logger(__name__)


async def recover_overdue_auctions(session: AsyncSession) -> list[FinalizeResult]:
    overdue = await due_auctions(session)
    if not overdue:
        logger.info("auctions.recovery", overdue_count=0)
        return []

    logger.info("auctions.recovery", overdue_count=len(overdue))
    service = AuctionService(session)
    results = []
    for auction in overdue:
        results.append(await service.finalize_auction(auction))
    return results
