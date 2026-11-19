"""Админка контейнеров: список, карточка, создание по шагам, правка (RU/EN),
шансы редкостей, состав (по ID, по редкости), копия, скрытие, удаление."""
from __future__ import annotations

import json
import re
from html import escape

from aiogram import F, Router
from aiogram.filters.callback_data import CallbackData
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message
from aiogram.utils.keyboard import InlineKeyboardBuilder
from sqlalchemy import text

from app.admin.permissions import require_permission
from app.callbacks.admin import AdminMenuCallback
from app.core.context import RequestContext
from app.core.exceptions import AppError
from app.utils.loc import split_bi

router = Router(name="admin_containers_panel")
NOCMD = ~F.text.startswith("/")
TXT_OR_PHOTO = F.photo | (F.text & ~F.text.startswith("/"))
PAGE = 10
KEYS = ("common", "rare", "epic", "mythic")
ICON = {"common": "⚪", "rare": "🔵", "epic": "🟣", "mythic": "🟡"}
RNAME = {"common": "Обычный", "rare": "Редкий", "epic": "Эпический", "mythic": "Легендарный"}
DEFAULT_CHANCES = {"common": 60, "rare": 30, "epic": 9, "mythic": 1}
CHANCE_HELP = ("🎲 Шансы редкостей одной строкой:\nобычный редкий эпический легендарный\n"
               "Пример: 60 30 9 1 (сумма не обязана быть 100)\n«-» = общие шансы")


class CtCb(CallbackData, prefix="act"):
    a: str
    i: int = 0
    k: str = "-"
    p: int = 1


class S(StatesGroup):
    name = State()
    price = State()
    desc = State()
    country = State()
    photo = State()
    newchances = State()
    edit = State()
    chances = State()
    car = State()


def _fmt(n: int) -> str:
    return f"{n:,}".replace(",", " ")


def _j(v):
    if isinstance(v, str):
        try:
            return json.loads(v)
        except ValueError:
            return None
    return v


def _num(m: Message) -> int:
    raw = (m.text or "").strip().replace(" ", "")
    if not raw.isdigit() or int(raw) <= 0:
        raise AppError("Нужно число больше 0")
    return int(raw)


def _parse_chances(raw: str):
    raw = raw.strip()
    if raw == "-":
        return None
    try:
        v = [float(x) for x in raw.replace(",", ".").split()]
    except ValueError:
        v = []
    if len(v) != 4 or any(x < 0 for x in v) or sum(v) <= 0:
        raise AppError("Нужно 4 числа: обычный редкий эпический легендарный\nПример: 60 30 9 1\n«-» = общие шансы")
    return dict(zip(KEYS, v))


def _rv(x):
    return getattr(x, "value", x)


# ------------------------------------------------------------------ список
async def _list(ctx, page: int):
    total = (await ctx.session.execute(text("SELECT count(*) FROM containers"))).scalar_one()
    pages = max((total + PAGE - 1) // PAGE, 1)
    page = max(1, min(page, pages))
    rows = (await ctx.session.execute(text(
        "SELECT c.id, c.name, c.price, c.is_enabled, "
        "(SELECT count(*) FROM container_cars cc WHERE cc.container_id=c.id) AS n "
        "FROM containers c ORDER BY c.id LIMIT :l OFFSET :o"),
        {"l": PAGE, "o": (page - 1) * PAGE})).all()
    lines = [f"📦 <b>Контейнеры</b> · {page}/{pages} · всего {total}", ""]
    b = InlineKeyboardBuilder()
    b.button(text="➕ Новый контейнер", callback_data=CtCb(a="new"))
    for r in rows:
        lines.append(f"{'🟢' if r.is_enabled else '🔴'} {r.id:02d} · {escape(r.name)} · ${_fmt(r.price)} · 🚗{r.n}")
        b.button(text=f"{'🟢' if r.is_enabled else '🔴'} {r.id:02d} · {r.name}"[:40],
                 callback_data=CtCb(a="view", i=r.id))
    if not rows:
        lines.append("Контейнеров пока нет.")
    nav = 0
    if page > 1:
        b.button(text="◀️", callback_data=CtCb(a="list", p=page - 1)); nav += 1
    b.button(text=f"{page}/{pages}", callback_data=CtCb(a="list", p=page)); nav += 1
    if page < pages:
        b.button(text="▶️", callback_data=CtCb(a="list", p=page + 1)); nav += 1
    b.button(text="◀️ В меню", callback_data=AdminMenuCallback(section="main"))
    b.adjust(1, *([1] * len(rows)), nav, 1)
    return "\n".join(lines), b.as_markup()


# ------------------------------------------------------------------ карточка
async def _card(ctx, cid: int):
    c = (await ctx.session.execute(text(
        "SELECT id,name,name_en,country,country_en,photo_file_id,price,is_enabled,"
        "description,description_en,rarity_chances FROM containers WHERE id=:i"), {"i": cid})).first()
    if c is None:
        raise AppError("Контейнер не найден")
    cars = (await ctx.session.execute(text(
        "SELECT cc.car_id, cars.name, cars.rarity, cars.is_active, cc.drop_weight FROM container_cars cc "
        "JOIN cars ON cars.id=cc.car_id WHERE cc.container_id=:i ORDER BY cars.rarity, cc.car_id"),
        {"i": cid})).all()

    own = _j(c.rarity_chances)
    glob = (await ctx.session.execute(text("SELECT value FROM settings WHERE key='rarity_chances'"))).scalar_one_or_none()
    chances = own or _j(glob) or DEFAULT_CHANCES
    present = {_rv(x.rarity) for x in cars if x.is_active}
    tot = sum(float(chances.get(k, 0)) for k in present) or 1.0
    eff = " ".join(f"{ICON[k]}{float(chances.get(k, 0)) / tot * 100:.3g}%" for k in KEYS if k in present)

    L = [f"📦 <b>{escape(c.name)}</b> · ID {c.id:02d}"]
    if c.name_en:
        L.append(f"🌐 {escape(c.name_en)}")
    if c.description:
        L.append(escape(c.description))
    if c.description_en:
        L.append(f"🌐 {escape(c.description_en)}")
    L.append(f"💰 Первая ставка: <b>${_fmt(c.price)}</b>")
    L.append(f"🌍 {escape(c.country) if c.country else '—'}" + (f" / {escape(c.country_en)}" if c.country_en else ""))
    L.append("🟢 Включён" if c.is_enabled else "🔴 Выключен")
    L.append("🎲 Шансы: " + (" / ".join(f"{own.get(k, 0):g}" for k in KEYS) if own else "общие"))
    if eff:
        L.append(f"🎯 Реально выпадает: {eff}")
    L += ["", f"🚗 <b>Состав ({len(cars)}):</b>"]
    if not cars:
        L.append("пусто")
    for x in cars[:40]:
        L.append(f"{ICON.get(_rv(x.rarity), '')} {x.car_id:03d} · {escape(x.name)} · вес {x.drop_weight}"
                 + ("" if x.is_active else " 🚫"))
    if len(cars) > 40:
        L.append(f"… и ещё {len(cars) - 40}")

    b = InlineKeyboardBuilder()
    for k, t_ in (("name", "✏️ Название"), ("name_en", "🌐 Название EN"),
                  ("desc", "📝 Описание"), ("desc_en", "🌐 Описание EN"),
                  ("price", "💰 Цена"), ("country", "🌍 Страна"),
                  ("country_en", "🌐 Страна EN"), ("photo", "🖼 Фото")):
        b.button(text=t_, callback_data=CtCb(a="ed", i=cid, k=k))
    b.button(text="🎲 Шансы", callback_data=CtCb(a="chances", i=cid))
    b.button(text="➕ Машины по ID", callback_data=CtCb(a="addcar", i=cid))
    b.button(text="➕ По редкости", callback_data=CtCb(a="addrar", i=cid))
    b.button(text="🧹 Очистить", callback_data=CtCb(a="clear", i=cid))
    shown = cars[:40]
    for x in shown:
        b.button(text=f"🗑 {x.car_id:03d}", callback_data=CtCb(a="rmcar", i=cid, k=str(x.car_id)))
    b.button(text="🔴 Выключить" if c.is_enabled else "🟢 Включить", callback_data=CtCb(a="tog", i=cid))
    b.button(text="📄 Копия", callback_data=CtCb(a="dup", i=cid))
    b.button(text="🗑 Удалить", callback_data=CtCb(a="del", i=cid))
    b.button(text="◀️ К списку", callback_data=CtCb(a="list"))
    b.adjust(2, 2, 2, 2, 1, 3, *([5] * ((len(shown) + 4) // 5)), 2, 1, 1)
    return "\n".join(L), b.as_markup(), c


async def _send(msg: Message, ctx, cid: int):
    txt, kb, c = await _card(ctx, cid)
    if c.photo_file_id and len(txt) <= 1000:
        await msg.answer_photo(c.photo_file_id, caption=txt, reply_markup=kb, parse_mode="HTML")
    elif c.photo_file_id:
        await msg.answer_photo(c.photo_file_id)
        await msg.answer(txt, reply_markup=kb, parse_mode="HTML")
    else:
        await msg.answer(txt, reply_markup=kb, parse_mode="HTML")


async def _gone(msg: Message):
    try:
        await msg.delete()
    except Exception:
        pass


# ------------------------------------------------------------------ вход / кнопки
@router.callback_query(AdminMenuCallback.filter(F.section == "containers"))
async def on_open(query: CallbackQuery, callback_data: AdminMenuCallback, ctx: RequestContext, state: FSMContext) -> None:
    if not await require_permission(query, ctx, "containers"):
        return
    await state.clear()
    txt, kb = await _list(ctx, 1)
    if query.message is not None:
        await query.message.edit_text(txt, reply_markup=kb, parse_mode="HTML")
    await query.answer()


@router.callback_query(CtCb.filter())
async def on_cb(query: CallbackQuery, callback_data: CtCb, ctx: RequestContext, state: FSMContext) -> None:
    if not await require_permission(query, ctx, "containers") or query.message is None:
        return
    a, i, k, p = callback_data.a, callback_data.i, callback_data.k, callback_data.p
    msg = query.message
    await query.answer()

    if a == "list":
        await state.clear()
        txt, kb = await _list(ctx, p)
        if msg.photo:
            await _gone(msg)
            await msg.answer(txt, reply_markup=kb, parse_mode="HTML")
        else:
            await msg.edit_text(txt, reply_markup=kb, parse_mode="HTML")
    elif a == "new":
        await state.clear()
        await state.set_state(S.name)
        await msg.answer("📦 Название: RU | EN (английский можно пропустить)")
    elif a == "view":
        await state.clear()
        await _gone(msg)
        await _send(msg, ctx, i)
    elif a == "ed":
        await state.set_state(S.edit)
        await state.update_data(cid=i, field=k)
        ask = {"name": "Новое название? (RU или RU | EN)", "name_en": "English name? (- remove)",
               "desc": "Новое описание? (RU или RU | EN, - убрать)", "desc_en": "English description? (- remove)",
               "price": "Новая цена первой ставки? (число)", "country": "Страна? (RU или RU | EN, - убрать)",
               "country_en": "English country? (- remove)", "photo": "Пришли фото (- убрать)"}
        await msg.answer(ask[k])
    elif a == "chances":
        await state.set_state(S.chances)
        await state.update_data(cid=i)
        await msg.answer(CHANCE_HELP)
    elif a == "addcar":
        await state.set_state(S.car)
        await state.update_data(cid=i)
        await msg.answer("🚗 Пришли ID машин списком (пробел, запятая или новая строка):\n001 002 003\n\n"
                         "Вес выпадения через двоеточие: 005:10 (по умолчанию 1). "
                         "Если машина уже в составе, вес обновится.")
    elif a == "addrar":
        b = InlineKeyboardBuilder()
        for r in KEYS:
            b.button(text=f"{ICON[r]} {RNAME[r]}", callback_data=CtCb(a="addrar2", i=i, k=r))
        b.button(text="❌ Отмена", callback_data=CtCb(a="view", i=i))
        b.adjust(2, 2, 1)
        await msg.answer("Добавить в состав все активные машины редкости (вес 1, уже добавленные не меняются):",
                         reply_markup=b.as_markup())
    elif a == "addrar2":
        if k in KEYS:
            await ctx.session.execute(text(
                "INSERT INTO container_cars (container_id, car_id, drop_weight) "
                "SELECT :c, id, 1 FROM cars WHERE rarity = CAST(:r AS rarity) AND is_active "
                "ON CONFLICT (container_id, car_id) DO NOTHING"), {"c": i, "r": k})
            await ctx.session.commit()
        await _gone(msg)
        await _send(msg, ctx, i)
    elif a == "clear":
        b = InlineKeyboardBuilder()
        b.button(text="✅ Да, очистить", callback_data=CtCb(a="clearyes", i=i))
        b.button(text="❌ Нет", callback_data=CtCb(a="view", i=i))
        b.adjust(2)
        await msg.answer("ⓘ Убрать все машины из состава?", reply_markup=b.as_markup())
    elif a == "clearyes":
        await ctx.session.execute(text("DELETE FROM container_cars WHERE container_id=:c"), {"c": i})
        await ctx.session.commit()
        await _gone(msg)
        await _send(msg, ctx, i)
    elif a == "rmcar":
        await ctx.session.execute(text("DELETE FROM container_cars WHERE container_id=:c AND car_id=:r"),
                                  {"c": i, "r": int(k)})
        await ctx.session.commit()
        await _gone(msg)
        await _send(msg, ctx, i)
    elif a == "tog":
        await ctx.session.execute(text("UPDATE containers SET is_enabled = NOT is_enabled WHERE id=:i"), {"i": i})
        await ctx.session.commit()
        await _gone(msg)
        await _send(msg, ctx, i)
    elif a == "dup":
        new = (await ctx.session.execute(text(
            "INSERT INTO containers (name,name_en,country,country_en,photo_file_id,price,description,"
            "description_en,rarity_chances,is_enabled) "
            "SELECT name || ' (копия)', name_en, country, country_en, photo_file_id, price, description, "
            "description_en, rarity_chances, false FROM containers WHERE id=:i RETURNING id"), {"i": i})).scalar_one()
        await ctx.session.execute(text(
            "INSERT INTO container_cars (container_id, car_id, drop_weight) "
            "SELECT :n, car_id, drop_weight FROM container_cars WHERE container_id=:i"), {"n": new, "i": i})
        await ctx.session.commit()
        await msg.answer(f"📄 Копия создана, ID {new:02d} (выключена)")
        await _send(msg, ctx, new)
    elif a == "del":
        b = InlineKeyboardBuilder()
        b.button(text="✅ Да, удалить", callback_data=CtCb(a="delyes", i=i))
        b.button(text="❌ Нет", callback_data=CtCb(a="view", i=i))
        b.adjust(2)
        await msg.answer("ⓘ Удалить контейнер? Он пропадёт и из инвентарей игроков. "
                         "Если по нему были аукционы, удаление не пройдёт: тогда «Выключить».",
                         reply_markup=b.as_markup())
    elif a == "delyes":
        try:
            await ctx.session.execute(text("DELETE FROM container_cars WHERE container_id=:i"), {"i": i})
            await ctx.session.execute(text("DELETE FROM containers WHERE id=:i"), {"i": i})
            await ctx.session.commit()
            await msg.answer("🗑 Контейнер удалён.")
        except Exception:
            await ctx.session.rollback()
            await msg.answer("ⓘ Нельзя удалить: есть аукционы. Нажми «Выключить» в карточке.")


# ------------------------------------------------------------------ создание по шагам
@router.message(S.name, NOCMD)
async def s_name(m: Message, ctx: RequestContext, state: FSMContext) -> None:
    ru, en = split_bi(m.text or "")
    if not ru:
        raise AppError("Напиши название")
    await state.update_data(name=ru, name_en=en)
    await state.set_state(S.price)
    await m.answer("💰 Цена первой ставки? (число)")


@router.message(S.price, NOCMD)
async def s_price(m: Message, ctx: RequestContext, state: FSMContext) -> None:
    await state.update_data(price=_num(m))
    await state.set_state(S.desc)
    await m.answer("📝 Описание: RU | EN (- пропустить)")


@router.message(S.desc, NOCMD)
async def s_desc(m: Message, ctx: RequestContext, state: FSMContext) -> None:
    ru, en = split_bi(m.text or "")
    await state.update_data(desc=ru, desc_en=en)
    await state.set_state(S.country)
    await m.answer("🌍 Страна: RU | EN (- пропустить)")


@router.message(S.country, NOCMD)
async def s_country(m: Message, ctx: RequestContext, state: FSMContext) -> None:
    ru, en = split_bi(m.text or "")
    await state.update_data(country=ru, country_en=en)
    await state.set_state(S.photo)
    await m.answer("🖼 Пришли фото (- пропустить)")


@router.message(S.photo, TXT_OR_PHOTO)
async def s_photo(m: Message, ctx: RequestContext, state: FSMContext) -> None:
    await state.update_data(photo=m.photo[-1].file_id if m.photo else None)
    await state.set_state(S.newchances)
    await m.answer(CHANCE_HELP)


@router.message(S.newchances, NOCMD)
async def s_newchances(m: Message, ctx: RequestContext, state: FSMContext) -> None:
    d = await state.get_data()
    ch = _parse_chances(m.text or "")
    cid = (await ctx.session.execute(text(
        "INSERT INTO containers (name,name_en,country,country_en,price,description,description_en,"
        "photo_file_id,rarity_chances,is_enabled) "
        "VALUES (:n,:ne,:c,:ce,:p,:d,:de,:f,CAST(:r AS json),true) RETURNING id"),
        {"n": d["name"], "ne": d.get("name_en"), "c": d.get("country"), "ce": d.get("country_en"),
         "p": d["price"], "d": d.get("desc"), "de": d.get("desc_en"), "f": d.get("photo"),
         "r": json.dumps(ch) if ch else None})).scalar_one()
    await ctx.session.commit()
    await state.clear()
    await m.answer("✅ Контейнер создан. Добавь машины: «➕ Машины по ID» или «➕ По редкости».")
    await _send(m, ctx, cid)


# ------------------------------------------------------------------ правка
@router.message(S.chances, NOCMD)
async def s_chances(m: Message, ctx: RequestContext, state: FSMContext) -> None:
    d = await state.get_data()
    ch = _parse_chances(m.text or "")
    await ctx.session.execute(text("UPDATE containers SET rarity_chances = CAST(:v AS json) WHERE id=:i"),
                              {"v": json.dumps(ch) if ch else None, "i": d["cid"]})
    await ctx.session.commit()
    await state.clear()
    await _send(m, ctx, d["cid"])


COLS = {"name": "name", "name_en": "name_en", "desc": "description", "desc_en": "description_en",
        "country": "country", "country_en": "country_en", "price": "price", "photo": "photo_file_id"}


@router.message(S.edit, TXT_OR_PHOTO)
async def s_edit(m: Message, ctx: RequestContext, state: FSMContext) -> None:
    d = await state.get_data()
    f, cid = d["field"], d["cid"]
    raw = (m.text or "").strip()
    sets: dict = {}
    if f == "price":
        sets["price"] = _num(m)
    elif f == "photo":
        sets["photo_file_id"] = m.photo[-1].file_id if m.photo else None
    elif f in ("name_en", "desc_en", "country_en"):
        sets[COLS[f]] = None if raw == "-" else raw
    else:  # name / desc / country, можно «RU | EN»
        ru, en = split_bi(raw)
        if f == "name" and not ru:
            raise AppError("Напиши название")
        sets[COLS[f]] = ru
        if en:
            sets[COLS[f + "_en"]] = en
    cols = ", ".join(f"{c}=:{c}" for c in sets)
    await ctx.session.execute(text(f"UPDATE containers SET {cols} WHERE id=:_i"), {**sets, "_i": cid})
    await ctx.session.commit()
    await state.clear()
    await _send(m, ctx, cid)


@router.message(S.car, NOCMD)
async def s_car(m: Message, ctx: RequestContext, state: FSMContext) -> None:
    d = await state.get_data()
    tokens = [t_ for t_ in re.split(r"[\s,;]+", (m.text or "").strip()) if t_]
    if not tokens:
        raise AppError("Пришли ID машин, например: 001 002 003")
    added, missing, bad = [], [], []
    for tok in tokens:
        idp, _, wp = tok.partition(":")
        if not idp.isdigit() or int(idp) <= 0 or (wp and (not wp.isdigit() or int(wp) <= 0)):
            bad.append(tok)
            continue
        car_id, weight = int(idp), int(wp) if wp else 1
        if (await ctx.session.execute(text("SELECT 1 FROM cars WHERE id=:i"), {"i": car_id})).first() is None:
            missing.append(f"{car_id:03d}")
            continue
        await ctx.session.execute(text(
            "INSERT INTO container_cars (container_id, car_id, drop_weight) VALUES (:c,:r,:w) "
            "ON CONFLICT (container_id, car_id) DO UPDATE SET drop_weight=:w"),
            {"c": d["cid"], "r": car_id, "w": weight})
        added.append(f"{car_id:03d}")
    await ctx.session.commit()
    await state.set_state(None)
    report = f"✅ Добавлено: {len(added)}"
    if missing:
        report += f"\n🔍 Нет такой машины: {' '.join(missing)}"
    if bad:
        report += f"\nⓘ Не понял: {' '.join(bad)}"
    await m.answer(report)
    await _send(m, ctx, d["cid"])
