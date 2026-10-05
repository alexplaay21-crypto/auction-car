"""Автооткрытие контейнеров, выданных наградами (BP, магазин, промокод)."""
from __future__ import annotations
from app.utils.loc import loc

from app.repositories.container import UserContainerRepository
from app.services.cars.service import CarService
from app.services.containers.inventory import ContainerInventoryService
from app.services.garage.service import GARAGE_LOW_TEXT, pop_garage_low


async def auto_open_and_notify(bot, session, user, chat_id: int) -> None:
    rows = await UserContainerRepository(session).list_for_user(user.id)
    pending = [(c.id, loc(c, "name", user.language), uc.quantity) for uc, c in rows if uc.quantity > 0]
    service = ContainerInventoryService(session)
    for container_id, name, qty in pending:
        for _ in range(qty):
            result = await service.open(user, container_id)
            text = f"📦 <b>{name}</b> открыт!\n\n" + CarService.format_card(result.car, user.language)
            if result.auto_sold_amount is not None:
                text += f"\n\n💸 Гараж полон, машина продана за ${result.auto_sold_amount:,}".replace(",", " ")
            if result.car.photo_file_id:
                await bot.send_photo(chat_id, result.car.photo_file_id, caption=text, parse_mode="HTML")
            else:
                await bot.send_message(chat_id, text, parse_mode="HTML")
            if pop_garage_low(session, user.id):
                await bot.send_message(chat_id, GARAGE_LOW_TEXT)
