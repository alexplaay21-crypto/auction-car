"""⚙️ Настройки (личный чат): язык, статистика, помощь, документация, промокод, группа, поддержка."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.filters.callback_data import CallbackData
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message
from aiogram.utils.keyboard import InlineKeyboardBuilder
from sqlalchemy import update

from app.callbacks.profile import ProfileCallback
from app.core.context import RequestContext
from app.core.enums import Language
from app.filters.command_alias import CommandAlias
from app.keyboards.main_menu import menu_text_variants
from app.localization.manager import t
from app.models.user import User
from app.handlers.settings.support import SupportStates
from app.states.promo import PromoStates

router = Router(name="settings_main")

# ЗАМЕНИ на свои ссылки
DOCS_URL = "https://telegra.ph/"
SUPPORT_URL = "https://t.me/your_support"

HELP_TEXT = (
    "❓ <b>Помощь</b>\n\n"
    "📦 <b>Контейнеры</b> — выигрывай их на аукционах или получай за бонусы. "
    "Из контейнера выпадает случайная машина.\n\n"
    "🔥 <b>Аукционы</b> — делай ставки, побеждает самая высокая.\n\n"
    "🚗 <b>Гараж</b> — хранит твои машины. Можно продать или расширить.\n\n"
    "🎁 <b>Ежедневный бонус</b> — бесплатный контейнер каждый день.\n\n"
    "🎫 <b>Battle Pass</b> — 1 уровень в день за открытый контейнер, награды за уровни.\n\n"
    "⬆️ <b>Навык гонщика</b> — качай за деньги, в гонках решает именно он.\n\n"
    "👥 <b>Рефералы</b> — приглашай друзей и получай награды."
)


class SettingsCallback(CallbackData, prefix="set"):
    action: str  # lang | lang_ru | lang_en | back | help | promo


HELP_ALIASES = ("help", "помощь")

HELP_PAGES = {
    "help": (
        "🎮 <b>ИГРА</b>\n\n"
        "📦 <b>Контейнеры</b> — выигрывай на аукционах или получай за бонусы. Внутри случайная машина.\n"
        "🔥 <b>Аукцион</b> — перебивай ставки, самая высокая забирает контейнер.\n"
        "🚗 <b>Гараж</b> — твои машины от дорогих к дешёвым. Можно расширять.\n"
        "🎁 <b>Бонус</b> — бесплатный контейнер каждый день.\n"
        "🎫 <b>Battle Pass</b> — 1 уровень в день за открытый контейнер, награды забираешь кнопкой.\n"
        "⬆️ <b>Навык гонщика</b> — качай за деньги, в гонках решает он.\n"
        "👥 <b>Рефералы</b> — приглашай друзей, за каждые 10 — эпическая машина.\n"
        "🛒 <b>Магазин</b> — товары за Telegram Stars ⭐.\n"
        "🏆 <b>Лидерборд</b> — богатые, гонщики, профит."
    ),
    "help_cmd": (
        "⌨️ <b>КОМАНДЫ</b>\n"
        "<i>Работают с / и без неё</i>\n\n"
        "🚗 Гараж — /inv · /inventory · инв · инвентарь · гараж\n"
        "🔍 Карточка машины — /car · /c · авто · а (например /car 001)\n"
        "💰 Продать государству — /sellcar ID · /sc · продать · прод\n🤝 Предложить игроку — /sell ID ИГРОК ЦЕНА · /offer · предложить · пред\n🌐 Язык группы — /setlang ru|en · язык (админы группы)\n"
        "💸 Перевод — /transfer · /tr · перевод · дать\n"
        "🔥 Ставка — /bet · /b · ставка · с\n"
        "📦 Контейнер — /container · /cont · конты · конт\n"
        "⏹ Стоп аукциона — /stop · /st · стоп · ст\n"
        "👑 VIP — /vip · /v · вип · випка\n"
        "🎟 Промокод — /promo · промокод\n"
        "🏆 Топ группы — /top · /rank · топ · рейтинг\n"
        "❓ Помощь — /help · help · помощь\n"
        "❌ Отмена ввода — /cancel · отмена"
    ),
    "help_eco": (
        "💰 <b>ЭКОНОМИКА</b>\n\n"
        "💵 Деньги идут от продажи машин, бонусов и наград BP.\n"
        "⚡ Быстрая продажа — сразу, но с комиссией.\n"
        "🤝 Продажа игроку и перевод — тоже с комиссией.\n"
        "👑 VIP — меньше комиссия и больше мест в гараже.\n"
        "🏠 Гараж расширяется за деньги, максимум зависит от VIP.\n"
        "⬆️ Навык гонщика качается за деньги, цена растёт с уровнем.\n"
        "⭐ Магазин и Battle Pass покупаются за Telegram Stars.\n"
        "🎁 Ежедневный бонус недоступен при балансе выше $100 000."
    ),
    "help_group": (
        "👥 <b>ГРУППА</b>\n\n"
        "🔥 В игровых группах идут свои аукционы.\n"
        "🏆 /top — рейтинг участников группы по балансу.\n"
        "⏹ /stop — остановить аукцион после текущего контейнера.\n"
        "➕ Список игровых групп: ⚙️ Настройки → 👥 Группа."
    ),
}


def _help_kb(active: str):
    b = InlineKeyboardBuilder()
    tabs = (("help", "🎮 Игра"), ("help_cmd", "⌨️ Команды"), ("help_eco", "💰 Экономика"), ("help_group", "👥 Группа"))
    for key, title in tabs:
        b.button(text=("✅ " if key == active else "") + title, callback_data=SettingsCallback(action=key))
    b.adjust(2, 2)
    return b.as_markup()


async def _help_url(session) -> str | None:
    from app.repositories.settings import SettingsRepository
    val = await SettingsRepository(session).get_value("help_url", "")
    return val if isinstance(val, str) and val.startswith("http") else None


async def _docs_url(session) -> str | None:
    from app.repositories.settings import SettingsRepository
    val = await SettingsRepository(session).get_value("docs_url", "")
    return val if isinstance(val, str) and val.startswith("http") else None


def _main_kb(help_url: str | None = None, docs_url: str | None = None):
    b = InlineKeyboardBuilder()
    b.button(text="🌐 Язык", callback_data=SettingsCallback(action="lang"))
    b.button(text="📊 Статистика", callback_data=ProfileCallback(action="statistics"))
    if help_url:
        b.button(text="❓ Помощь", url=help_url)
    else:
        b.button(text="❓ Помощь", callback_data=SettingsCallback(action="help"))
    if docs_url:
        b.button(text="📖 Документация", url=docs_url)
    else:
        b.button(text="📖 Документация", callback_data=SettingsCallback(action="docs"))
    b.button(text="🎟 Промокод", callback_data=SettingsCallback(action="promo"))
    b.button(text="👥 Группа", callback_data=SettingsCallback(action="group"))
    b.button(text="🆘 Поддержка", callback_data=SettingsCallback(action="support"))
    b.button(text="🔔 Уведомления", callback_data=SettingsCallback(action="notif"))
    b.adjust(2, 2, 2, 2)
    return b.as_markup()


def _back_kb():
    b = InlineKeyboardBuilder()
    b.button(text="◀️ Назад", callback_data=SettingsCallback(action="back"))
    return b.as_markup()


def _lang_kb():
    b = InlineKeyboardBuilder()
    b.button(text="🇷🇺 Русский", callback_data=SettingsCallback(action="lang_ru"))
    b.button(text="🇬🇧 English", callback_data=SettingsCallback(action="lang_en"))
    b.button(text="◀️ Назад", callback_data=SettingsCallback(action="back"))
    b.adjust(2, 1)
    return b.as_markup()


@router.message(F.text.in_(menu_text_variants("menu_settings")))
async def show_settings(message: Message, ctx: RequestContext, state: FSMContext) -> None:
    await state.clear()
    await message.answer("⚙️ <b>Настройки</b>", reply_markup=_main_kb(await _help_url(ctx.session), await _docs_url(ctx.session)), parse_mode="HTML")


@router.callback_query(SettingsCallback.filter())
async def on_settings(
    query: CallbackQuery, callback_data: SettingsCallback, ctx: RequestContext, state: FSMContext
) -> None:
    await query.answer()
    if query.message is None:
        return
    action = callback_data.action
    msg = query.message

    if action == "lang":
        await msg.edit_text("🌐 <b>Выберите язык</b>", reply_markup=_lang_kb(), parse_mode="HTML")
    elif action in ("lang_ru", "lang_en"):
        lang = Language.RU if action == "lang_ru" else Language.EN
        await ctx.session.execute(update(User).where(User.id == ctx.user.id).values(language=lang))
        await ctx.session.commit()
        await msg.edit_text("✅ Язык изменён.", reply_markup=_main_kb(await _help_url(ctx.session), await _docs_url(ctx.session)))
    elif action == "help":
        await msg.answer("❓ Ссылка на помощь скоро появится.")
    elif action in HELP_PAGES:
        await msg.edit_text(HELP_PAGES[action], reply_markup=_help_kb(action), parse_mode="HTML")
    elif action == "support":
        await state.set_state(SupportStates.waiting_text)
        await msg.answer("🆘 <b>ПОДДЕРЖКА</b>\n\nНашёл баг или есть идея?\nНапиши минимум 5 слов, и получи награду!", parse_mode="HTML")
    elif action == "notif" or action.startswith("nt_"):
        from app.repositories.user import UserSettingRepository
        repo = UserSettingRepository(ctx.session)
        cur = await repo.get_value(ctx.user.id, "notif")
        cur = dict(cur) if isinstance(cur, dict) else {}
        if action.startswith("nt_"):
            kind = action[3:]
            cur[kind] = not cur.get(kind, True)
            await repo.set_value(ctx.user.id, "notif", cur)
            await ctx.session.commit()
        nb = InlineKeyboardBuilder()
        for kind, title in (("bonus", "🎁 Ежедневный бонус"), ("offers", "🤝 Входящие предложения"), ("news", "📰 Новости")):
            nb.button(text=("✅ " if cur.get(kind, True) else "❌ ") + title,
                      callback_data=SettingsCallback(action="nt_" + kind))
        nb.button(text="◀️ Вернуться", callback_data=SettingsCallback(action="back"))
        nb.adjust(1)
        await msg.edit_text("🔔 <b>Уведомления</b>\n\nНажми, чтобы включить или выключить.",
                            reply_markup=nb.as_markup(), parse_mode="HTML")
    elif action == "docs":
        await msg.answer("📖 Ссылка на документацию скоро появится.")
    elif action == "promo":
        await state.set_state(PromoStates.waiting_for_code)
        await msg.answer(t("promo_prompt", ctx.language))
    elif action == "group":
        from html import escape
        from sqlalchemy import select
        from app.models.group import Group
        groups = list((await ctx.session.execute(
            select(Group).where(Group.is_active.is_(True), Group.auction_enabled.is_(True))
            .order_by(Group.id.desc()).limit(20)
        )).scalars())
        lines = ["👥 <b>Игровые группы</b>", ""]
        if not groups:
            lines.append("Пока нет игровых групп.")
        for g in groups:
            title = escape(g.title or str(g.id))
            link = g.invite_link
            if not link:
                try:
                    chat = await query.bot.get_chat(g.id)
                    link = chat.invite_link or (f"https://t.me/{chat.username}" if chat.username else None)
                    if link is None:
                        link = (await query.bot.create_chat_invite_link(g.id)).invite_link
                    g.invite_link = link
                    await ctx.session.commit()
                except Exception:
                    link = None
            lines.append(f'🎮 <a href="{link}">{title}</a>' if link else f"🎮 {title}")
        lines += ["", "Хочешь играть в своей группе? Добавь бота:"]
        me = await query.bot.get_me()
        b = InlineKeyboardBuilder()
        b.button(
            text="➕ Добавить бота в свою группу",
            url=f"https://t.me/{me.username}?startgroup=true&admin=delete_messages+invite_users+pin_messages",
        )
        b.button(text="◀️ Вернуться", callback_data=SettingsCallback(action="back"))
        b.adjust(1)
        await msg.edit_text("\n".join(lines), reply_markup=b.as_markup(),
                            parse_mode="HTML", disable_web_page_preview=True)
    else:
        await msg.edit_text("⚙️ <b>Настройки</b>", reply_markup=_main_kb(await _help_url(ctx.session), await _docs_url(ctx.session)), parse_mode="HTML")


@router.message(CommandAlias(*HELP_ALIASES))
async def cmd_help(message: Message, ctx: RequestContext, command_args: str | None = None) -> None:
    url = await _help_url(ctx.session)
    if url:
        b = InlineKeyboardBuilder()
        b.button(text="❓ Открыть помощь", url=url)
        await message.answer("❓ <b>Помощь</b>", reply_markup=b.as_markup(), parse_mode="HTML")
        return
    await message.answer("❓ Ссылка на помощь скоро появится.")
