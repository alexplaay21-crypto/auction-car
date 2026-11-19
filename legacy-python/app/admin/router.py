"""Корневой роутер админ-панели — весь раздел заперт фильтром IsAdmin()
(владелец проходит всегда, filters/admin.py + core/permissions.py).
/admin открывает главное меню; разделы подключаются include_router'ами
ниже по мере реализации (готовы Users/Cars/Containers/Garage/Shop/Battle Pass/VIP/Promo/
Groups/Documentation/Database/Admins/Broadcasts/Statistics/Backups)."""
from __future__ import annotations

from aiogram import Router
from aiogram.fsm.context import FSMContext
from aiogram.types import Message

from app.admin.admins import router as admins_router
from app.admin.backups import router as backups_router
from app.admin.battle_pass import router as battle_pass_router
from app.admin.broadcasts import router as broadcasts_router
from app.admin.cars import router as cars_router
from app.admin.containers import router as containers_router
from app.admin.database import router as database_router
from app.admin.documentation import router as documentation_router
from app.admin.garage import router as garage_router
from app.admin.groups import router as groups_router
from app.admin.promo import router as promo_router
from app.admin.shop import router as shop_router
from app.admin.skills import router as skills_router
from app.admin.statistics import router as statistics_router
from app.admin.vip import router as vip_router
from app.admin.commissions import router as commissions_router
from app.admin.menu import admin_menu_text
from app.admin.users import router as users_router
from app.core.context import RequestContext
from app.filters.admin import IsAdmin
from app.filters.command_alias import CommandAlias
from app.keyboards.admin import admin_menu_keyboard
from app.localization.manager import t

router = Router(name="admin")
router.message.filter(IsAdmin())
router.callback_query.filter(IsAdmin())

ALIASES = ("admin", "админ")

@router.message(CommandAlias(*ALIASES))
async def cmd_admin(
    message: Message, ctx: RequestContext, state: FSMContext, command_args: str
) -> None:
    await state.clear()
    await message.answer(admin_menu_text(ctx.language), reply_markup=admin_menu_keyboard(ctx.language))


from app.admin.back import router as back_router
router.include_router(back_router)
router.include_router(users_router)
router.include_router(cars_router)
router.include_router(containers_router)
router.include_router(garage_router)
router.include_router(shop_router)
router.include_router(battle_pass_router)
router.include_router(vip_router)
router.include_router(promo_router)
router.include_router(groups_router)
router.include_router(documentation_router)
router.include_router(database_router)
router.include_router(admins_router)
router.include_router(broadcasts_router)
router.include_router(statistics_router)
router.include_router(backups_router)
router.include_router(skills_router)
router.include_router(commissions_router)
