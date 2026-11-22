// lib/botui.js — экраны бота: меню, профиль, гараж, магазин, лидеры, друзья.
// Данные — те же функции views.js, что и в Mini App.
import { starProducts } from './stars.js';
import { profileView, garageView, carView, topView, money, who, esc, RARITY, carCardText } from './views.js';
import { settings, getUser } from './engine.js';
import { MINI_APP_URL, BOT_USERNAME, APP_NAME } from './config.js';

export const MENU = {
  play: '🎮 Играть', garage: '🚗 Гараж', profile: '👤 Профиль', bonus: '🎁 Бонус',
  shop: '🛒 Магазин', top: '🏆 Лидеры', friends: '👥 Друзья', help: '❓ Помощь',
};

export function menuKeyboard() {
  return {
    keyboard: [
      [{ text: MENU.play }, { text: '📱 Открыть игру', web_app: { url: MINI_APP_URL } }],
      [{ text: MENU.garage }, { text: MENU.profile }],
      [{ text: MENU.bonus }, { text: MENU.shop }],
      [{ text: MENU.top }, { text: MENU.friends }, { text: MENU.help }],
    ],
    resize_keyboard: true, is_persistent: true,
  };
}

const app = (hash = '', text = '📱 Открыть в игре') => ({ text, web_app: { url: MINI_APP_URL + (hash ? '#' + hash : '') } });

export function welcomeText(first) {
  return `👋 Привет${first ? ', ' + esc(first) : ''}! Это <b>${APP_NAME}</b> — аукцион контейнеров с машинами.\n\n` +
    '📦 Каждый раунд разыгрывается контейнер. Ставь выше других — таймер запускается заново после каждой ставки.\n' +
    '🏆 Последняя ставка забирает контейнер, а внутри — случайная машина: ⚪ обычная, 🔵 редкая, 🟣 эпическая или 🟡 легендарная.\n' +
    '🏁 Гоняй против ботов и игроков, качай навык гонщика.\n' +
    '🛒 Продавай и покупай машины на рынке, проходи Battle Pass.\n\n' +
    'Играть можно здесь кнопками или в приложении — это одна и та же игра: ставка в одном месте сразу видна в другом.';
}

export function helpText() {
  return '<b>Как играть</b>\n\n' +
    '🎮 <b>Играть</b> — войти в комнату аукциона (до 30 игроков).\n' +
    '💵 Ставки — кнопками под сообщением комнаты или командой <code>/bet 7500</code>.\n' +
    '⏳ После каждой ставки таймер запускается заново. Кто поставил последним — забирает контейнер.\n' +
    '💸 Ставка списывается сразу; если тебя перебили — деньги возвращаются.\n' +
    '😴 Без ставок 2 контейнера подряд — выход из комнаты.\n\n' +
    '<b>Команды</b>\n' +
    '/play — играть · /bet сумма — ставка · /leave — выйти из комнаты\n' +
    '/garage — гараж · /profile — профиль · /bonus — бонус в 00:00 и 12:00 · /shop — магазин\n' +
    '/transfer @игрок сумма — перевод · /promo КОД — промокод · /top — лидеры\n' +
    '/report текст — сообщить о проблеме · /idea текст — предложить идею\n\n' +
    'В группе: добавь бота и напиши /play — у группы будет своя комната.';
}

export async function profileScreen(db, uid) {
  const p = await profileView(db, uid);
  const s = p.stats;
  const text = `👤 <b>${esc(who(p.user))}</b>${p.user.is_vip ? ' 👑 VIP' : ''}\n\n` +
    `💰 Баланс: <b>${money(p.balance)}</b> · место в рейтинге: #${p.place}\n` +
    `🚗 Гараж: ${p.garage.owned}/${p.garage.capacity} · стоимость ${money(p.garage.value)}\n` +
    (p.best ? `⭐ Лучшая: ${RARITY[p.best.rarity]?.icon ?? ''} ${esc(p.best.name)} (${money(p.best.price)})\n` : '') +
    `\n📦 Открыто контейнеров: ${s.containers_opened} · побед: ${s.wins} · ставок: ${s.bids_made}\n` +
    `🔁 Продано машин: ${s.cars_sold} · заработано ${money(s.earned_total)} · потрачено ${money(s.spent_total)}\n` +
    `👥 Приглашено друзей: ${s.referrals}\n\n` +
    `Комиссии: быстрая продажа ${p.fees.quick / 100}% · государству ${p.fees.state / 100}% · игроку ${p.fees.player / 100}% · перевод ${p.fees.transfer / 100}%`;
  const rows = [];
  if (p.bonus.available) rows.push([{ text: `🎁 Забрать бонус ${money(p.bonus.amount)}`, callback_data: 'bonus' }]);
  if (!p.user.is_vip) rows.push([{ text: '👑 VIP навсегда за ⭐ Stars', callback_data: 'st:vip' }]);
  rows.push([app('profile')]);
  return { text, reply_markup: { inline_keyboard: rows } };
}

export async function garageScreen(db, uid, page = 1) {
  const g = await garageView(db, uid, { page, size: 8 });
  let text = `🚗 <b>Гараж</b> · ${g.owned}/${g.capacity} мест · стоимость ${money(g.value)}\n`;
  if (!g.cars.length) text += '\nПусто. Выиграй контейнер на аукционе: «🎮 Играть».';
  const rows = g.cars.map((c) => [{ text: `${RARITY[c.rarity]?.icon ?? ''} ${c.name} · ${money(c.price)}`, callback_data: `c:${c.user_car_id}` }]);
  const nav = [];
  if (page > 1) nav.push({ text: '⬅️', callback_data: `gp:${page - 1}` });
  if (page * g.size < g.total) nav.push({ text: '➡️', callback_data: `gp:${page + 1}` });
  if (nav.length) rows.push(nav);
  if (g.containers.length) {
    text += '\n📦 Контейнеры: ' + g.containers.map((c) => `${c.emoji ?? ''} ${esc(c.name)} ×${c.qty}`).join(', ');
    for (const c of g.containers.slice(0, 3)) rows.push([{ text: `📦 Открыть ${c.name}`, callback_data: `oc:${c.id}` }]);
  }
  if (g.next_tier) rows.push([{ text: `➕ До ${g.next_tier.total} мест за ${money(g.next_tier.price)}`, callback_data: 'gup' }]);
  rows.push([app('garage')]);
  return { text, reply_markup: { inline_keyboard: rows } };
}

export async function carScreen(db, uid, userCarId) {
  const c = await carView(db, uid, userCarId);
  if (!c) return null;
  const text = carCardText(c, { sale: c.sale });
  const rows = [];
  if (c.status === 'owned' && c.sale) rows.push([{ text: `💰 Продать за ${money(c.sale.amount)}`, callback_data: `s:${userCarId}` }]);
  rows.push([{ text: '⬅️ Гараж', callback_data: 'gp:1' }, app('car-' + userCarId, '🤝 Продать игроку')]);
  return { text, reply_markup: { inline_keyboard: rows }, carId: c.id };
}

export async function shopScreen(db, uid) {
  const st = await settings(db);
  const u = await getUser(db, uid);
  const items = await starProducts(db, uid);
  const lots = await db.all('SELECT * FROM shop_lots WHERE is_available = 1 ORDER BY sort, id LIMIT 6');
  let text = `🛒 <b>Магазин</b> · баланс ${money(u.balance)}`;
  const rows = [];
  const vip = items.find((p) => p.kind === 'vip');
  if (vip && !u.is_vip) {
    text += `\n\n👑 <b>VIP навсегда — ⭐ ${vip.stars}</b>\n` + vip.perks.map(([, t, d]) => `• ${t} <i>(${d})</i>`).join('\n');
    rows.push([{ text: `👑 VIP навсегда · ⭐ ${vip.stars}`, callback_data: `st:${vip.id}` }]);
  }
  const bp = items.find((p) => p.kind === 'bp'), dx = items.find((p) => p.kind === 'bpdx'), lv = items.find((p) => p.kind === 'bplvl');
  if (bp && bp.season) {
    text += `\n\n🏆 <b>Battle Pass · ${esc(bp.season)}</b>`;
    if (!bp.owned) {
      text += `\nПремиум — ⭐ ${bp.stars}: ${bp.car ? `машина <b>${esc(bp.car.name)}</b> сразу в гараж + ` : ''}премиум-награды всех уровней.`;
      if (dx) text += `\nДелюкс — ⭐ ${dx.stars} после премиума: ${dx.car ? `легендарная <b>${esc(dx.car.name)}</b> + ` : ''}5 уровней.`;
      rows.push([{ text: `🏆 Премиум · ⭐ ${bp.stars}`, callback_data: 'st:bp' }]);
    } else if (dx && !dx.blocked) {
      text += `\nДелюкс — ⭐ ${dx.stars}: ${dx.car ? `легендарная <b>${esc(dx.car.name)}</b> + ` : ''}5 уровней сразу.`;
      rows.push([{ text: `💎 Делюкс +5 уровней · ⭐ ${dx.stars}`, callback_data: 'st:bpdx' }]);
    }
    if (lv && !lv.blocked) { text += `\nУровень — ⭐ ${lv.stars}.`; rows.push([{ text: `⬆️ Открыть уровень · ⭐ ${lv.stars}`, callback_data: 'st:bplvl' }]); }
  }
  text += '\n\n💰 <b>Игровая валюта</b> — чем больше пакет, тем выгоднее:';
  const packs = items.filter((p) => p.kind === 'money');
  for (const p of packs) text += `\n⭐ ${p.stars} → <b>${money(p.money)}</b>${p.bonus_pct ? ` <i>(+${p.bonus_pct}% выгоды)</i>` : ''}${p.badge === 'popular' ? ' 🔥' : p.badge === 'best' ? ' 💎' : ''}`;
  for (let i = 0; i < packs.length; i += 2) rows.push(packs.slice(i, i + 2).map((p) => ({ text: `⭐ ${p.stars} → ${money(p.money)}`, callback_data: `st:${p.id}` })));
  for (const l of lots) {
    text += `\n\n🎁 <b>${esc(l.title)}</b> — ${money(l.price)}${l.description ? '\n' + esc(l.description) : ''}`;
    rows.push([{ text: `Купить «${l.title}» за ${money(l.price)}`, callback_data: `buy:${l.id}` }]);
  }
  rows.push([app('shop')]);
  return { text, reply_markup: { inline_keyboard: rows } };
}

export async function topScreen(db, kind = 'balance') {
  const list = await topView(db, kind);
  const title = { balance: '💰 Самые богатые', garage: '🚗 Самые дорогие гаражи', wins: '🏆 Больше всех побед' }[kind];
  const medal = (i) => ['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`;
  const text = `<b>${title}</b>\n\n` + (list.slice(0, 15).map((u, i) => `${medal(i)} ${esc(who(u))}${u.is_vip ? ' 👑' : ''} — ${kind === 'wins' ? u.value : money(u.value)}`).join('\n') || 'Пока пусто');
  const rows = [[
    { text: '💰 Баланс', callback_data: 'top:balance' }, { text: '🚗 Гараж', callback_data: 'top:garage' }, { text: '🏆 Победы', callback_data: 'top:wins' },
  ], [app('top')]];
  return { text, reply_markup: { inline_keyboard: rows } };
}

export async function friendsScreen(db, uid) {
  const st = await settings(db);
  const u = await getUser(db, uid);
  const link = `https://t.me/${BOT_USERNAME}?start=ref_${uid}`;
  const text = `👥 <b>Приглашай друзей</b>\n\n` +
    `За каждого друга: тебе <b>${money(st.ref_inviter)}</b>, другу <b>${money(st.ref_invited)}</b>.\n` +
    `Когда друг сделает первую покупку — ещё <b>${money(st.ref_first_purchase)}</b> тебе.\n` +
    `Каждые ${st.ref_epic_every} друзей — 🟣 эпическая машина в подарок.\n\n` +
    `Приглашено: <b>${u.referrals_count}</b>\nТвоя ссылка:\n<code>${link}</code>`;
  return { text, reply_markup: { inline_keyboard: [[{ text: '📤 Поделиться', url: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Залетай на аукцион машин!')}` }]] } };
}
