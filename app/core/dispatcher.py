"""Сборка aiogram Dispatcher.

На этом этапе (Core) диспетчер создаётся с хранилищем FSM-состояний в Redis.
Конкретные роутеры (app/handlers/*) подключаются в register_routers() по
мере реализации соответствующих этапов (Registration, Profile, Garage,
Auction, ...) — функция дополняется новыми include_router() без изменения
остальной структуры, чтобы не ломать уже готовое."""
from __future__ import annotations

from aiogram import Dispatcher
from aiogram.fsm.storage.redis import RedisStorage

from app.database.redis import get_redis


def create_dispatcher() -> Dispatcher:
    storage = RedisStorage(redis=get_redis())
    dp = Dispatcher(storage=storage)
    return dp


def register_middlewares(dp: Dispatcher) -> None:
    """Регистрирует outer-middlewares в порядке: errors (снаружи) ->
    database -> user -> language -> antiflood -> admin -> (роутеры).
    Порядок регистрации = порядок оборачивания (первый зарегистрированный
    оборачивает всех остальных), поэтому errors идёт первым, чтобы поймать
    исключения из всей цепочки, включая database.py.

    ВАЖНО: регистрируем на dp.message / dp.callback_query, а не на
    dp.update — в dp.update.outer_middleware событие это объект Update,
    а наши middlewares работают с Message/CallbackQuery (from_user, chat,
    answer). Каждому наблюдателю — свои экземпляры middleware."""
    from app.middlewares.admin import AdminMiddleware
    from app.middlewares.antiflood import AntiFloodMiddleware
    from app.middlewares.database import DatabaseMiddleware
    from app.middlewares.errors import ErrorsMiddleware
    from app.middlewares.language import LanguageMiddleware
    from app.middlewares.user import UserMiddleware

    for observer in (dp.message, dp.callback_query):
        for middleware_cls in (
            ErrorsMiddleware,
            DatabaseMiddleware,
            UserMiddleware,
            LanguageMiddleware,
            AntiFloodMiddleware,
            AdminMiddleware,
        ):
            observer.outer_middleware(middleware_cls())


def register_routers(dp: Dispatcher) -> None:
    """Подключение роутеров. Порядок важен: более специфичные раньше
    общих catch-all. Заполняется поэтапно."""
    from app.admin import router as admin_router
    from app.handlers.auction import router as auction_router
    from app.handlers.battle_pass import router as battle_pass_router
    from app.handlers.common import router as common_router
    from app.handlers.economy import router as economy_router
    from app.handlers.garage import router as garage_router
    from app.handlers.leaderboard import router as leaderboard_router
    from app.handlers.profile import router as profile_router
    from app.handlers.promo import router as promo_router
    from app.handlers.referrals import router as referrals_router
    from app.handlers.settings import router as settings_router
    from app.handlers.shop import router as shop_router
    from app.handlers.skills import router as skills_router
    from app.handlers.vip import router as vip_router

    dp.include_router(common_router)
    dp.include_router(admin_router)
    dp.include_router(profile_router)
    dp.include_router(garage_router)
    dp.include_router(auction_router)
    dp.include_router(economy_router)
    dp.include_router(vip_router)
    dp.include_router(referrals_router)
    dp.include_router(battle_pass_router)
    dp.include_router(shop_router)
    dp.include_router(promo_router)
    dp.include_router(leaderboard_router)
    dp.include_router(skills_router)
    dp.include_router(settings_router)
