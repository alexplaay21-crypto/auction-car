// lib/views.js — общие представления данных для бота и Mini App. И бот, и Mini App
// читают одно и то же отсюда, поэтому всё, что меняется в одном, сразу видно в другом.
import { settings, getUser, chances, nextTier, bonusState, sellRate, now } from './engine.js';

export const RARITY = {
  common: { ru: 'Обычная', icon: '⚪' },
  rare: { ru: 'Редкая', icon: '🔵' },
  epic: { ru: 'Эпическая', icon: '🟣' },
  mythic: { ru: 'Легендарная', icon: '🟡' },
  mystic: { ru: 'Мистическая', icon: '🔴' },
};

export const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('ru-RU').replace(/ /g, ' ');
export const who = (u) => (u?.username ? '@' + u.username : u?.first_name || (u?.id ? 'игрок ' + u.id : '—'));

const USER_COLS = 'id, username, first_name, photo_url, is_vip';

export async function roomView(db, roomId, uid = null) {
  const st = await settings(db);
  const room = await db.get('SELECT * FROM rooms WHERE id = :r', { ':r': roomId });
  if (!room) return null;
  const t = await now(db);
  const members = await db.all(
    `SELECT u.id, u.username, u.first_name, u.photo_url, u.is_vip, m.missed FROM room_members m JOIN users u ON u.id = m.user_id
     WHERE m.room_id = :r AND m.left_at IS NULL ORDER BY m.joined_at`, { ':r': roomId });
  const a = await db.get(`SELECT * FROM auctions WHERE room_id = :r ORDER BY id DESC LIMIT 1`, { ':r': roomId });
  let auction = null;
  if (a) {
    const c = await db.get('SELECT * FROM containers WHERE id = :c', { ':c': a.container_id });
    const bids = await db.all(
      `SELECT b.amount, b.created_at, b.user_id, u.username, u.first_name FROM bids b LEFT JOIN users u ON u.id = b.user_id
       WHERE b.auction_id = :a ORDER BY b.id DESC LIMIT 8`, { ':a': a.id });
    const leader = a.leader_id ? await db.get(`SELECT ${USER_COLS} FROM users WHERE id = :u`, { ':u': a.leader_id }) : null;
    let car = null;
    if (a.car_id) {
      car = await db.get('SELECT * FROM cars WHERE id = :c', { ':c': a.car_id });
      const uc = await db.get(`SELECT id, status, sold_amount FROM user_cars WHERE source = 'auction' AND source_ref = :a`, { ':a': a.id });
      car = { ...car, user_car_id: uc?.id ?? null, auto_sold: uc?.status === 'sold' ? uc.sold_amount : null };
    }
    auction = {
      id: a.id, status: a.status, container: c, initial: a.initial_bid, current: a.current_bid, leader, bids_count: a.bids_count,
      ends_at: a.ends_at, left: Math.max(0, a.ends_at - t), min_bid: a.current_bid + st.bet_step, bids, car,
      chances: await chances(db, a.container_id),
    };
  }
  const me = uid ? members.find((m) => m.id === uid) : null;
  return {
    id: room.id, number: room.number, scope: room.scope, scope_id: room.scope_id, status: room.status, rev: room.rev,
    max: room.max_players, members, count: members.length, next_at: room.next_at, now: t, step: st.bet_step,
    timer: st.auction_timer_s, kick_after: st.kick_after, auction, in_room: !!me, my_missed: me?.missed ?? 0,
  };
}

export async function garageView(db, uid, { page = 1, size = 30, rarity = null } = {}) {
  const u = await getUser(db, uid);
  const where = `uc.user_id = :u AND uc.status = 'owned'` + (rarity ? ' AND c.rarity = :r' : '');
  const p = { ':u': uid, ...(rarity ? { ':r': rarity } : {}) };
  const total = (await db.get(`SELECT count(*) AS n FROM user_cars uc JOIN cars c ON c.id = uc.car_id WHERE ${where}`, p)).n;
  const rows = await db.all(
    `SELECT uc.id AS user_car_id, uc.obtained_at, uc.source, uc.paid, c.* FROM user_cars uc JOIN cars c ON c.id = uc.car_id
     WHERE ${where} ORDER BY CASE c.rarity WHEN 'mystic' THEN -1 WHEN 'mythic' THEN 0 WHEN 'epic' THEN 1 WHEN 'rare' THEN 2 ELSE 3 END, c.price DESC, uc.id DESC
     LIMIT :n OFFSET :o`, { ...p, ':n': size, ':o': (Math.max(1, page) - 1) * size });
  const value = (await db.get(`SELECT COALESCE(sum(c.price), 0) AS v FROM user_cars uc JOIN cars c ON c.id = uc.car_id WHERE uc.user_id = :u AND uc.status = 'owned'`, { ':u': uid })).v;
  const owned = (await db.get(`SELECT count(*) AS n FROM user_cars WHERE user_id = :u AND status = 'owned'`, { ':u': uid })).n;
  const containers = await db.all(
    `SELECT uc.container_id AS id, uc.qty, c.name, c.emoji, c.price FROM user_containers uc JOIN containers c ON c.id = uc.container_id
     WHERE uc.user_id = :u AND uc.qty > 0`, { ':u': uid });
  const offers = await db.all(
    `SELECT o.*, c.name AS car_name, c.rarity, s.username AS seller_username, s.first_name AS seller_name
     FROM sale_offers o JOIN user_cars uc ON uc.id = o.user_car_id JOIN cars c ON c.id = uc.car_id LEFT JOIN users s ON s.id = o.seller_id
     WHERE (o.buyer_id = :u OR o.seller_id = :u) AND o.status = 'pending' AND o.expires_at > (SELECT now FROM v_now) ORDER BY o.id DESC`, { ':u': uid });
  return { me: uid, cars: rows, total, page, size, owned, capacity: u.garage_capacity, value, containers, offers, next_tier: await nextTier(db, u) };
}

export async function carView(db, uid, userCarId) {
  const r = await db.get(
    `SELECT uc.id AS user_car_id, uc.user_id, uc.obtained_at, uc.source, uc.paid, uc.status, c.* FROM user_cars uc JOIN cars c ON c.id = uc.car_id
     WHERE uc.id = :i`, { ':i': userCarId });
  if (!r || r.user_id !== uid) return null;
  const sale = r.status === 'owned' ? await sellRate(db, uid, userCarId) : null;
  return { ...r, sale };
}

export async function profileView(db, uid) {
  const u = await getUser(db, uid);
  const st = await settings(db);
  const g = await db.get(
    `SELECT count(*) AS n, COALESCE(sum(c.price), 0) AS v FROM user_cars uc JOIN cars c ON c.id = uc.car_id WHERE uc.user_id = :u AND uc.status = 'owned'`, { ':u': uid });
  const best = await db.get(
    `SELECT c.name, c.rarity, c.price FROM user_cars uc JOIN cars c ON c.id = uc.car_id WHERE uc.user_id = :u AND uc.status = 'owned' ORDER BY c.price DESC LIMIT 1`, { ':u': uid });
  const place = (await db.get('SELECT count(*) + 1 AS p FROM users WHERE id > 0 AND balance > :b', { ':b': u.balance })).p;
  return {
    user: { id: u.id, username: u.username, first_name: u.first_name, photo_url: u.photo_url, is_vip: u.is_vip, is_admin: u.is_admin, created_at: u.created_at, profile_bg: u.profile_bg ?? null, profile_frame: u.profile_frame ?? null },
    balance: u.balance, garage: { owned: g.n, value: g.v, capacity: u.garage_capacity }, best,
    stats: {
      containers_opened: u.containers_opened, wins: u.wins, bids_made: u.bids_made, cars_obtained: u.cars_obtained,
      cars_sold: u.cars_sold, spent_total: u.spent_total, earned_total: u.earned_total, referrals: u.referrals_count,
    },
    place, bonus: await bonusState(db, uid), vip_price: st.vip_price,
    referral: { inviter: st.ref_inviter, invited: st.ref_invited, first_purchase: st.ref_first_purchase, epic_every: st.ref_epic_every },
    fees: {
      quick: u.is_vip ? st.comm_quick_vip_bps : st.comm_quick_bps, state: u.is_vip ? st.comm_state_vip_bps : st.comm_state_bps,
      player: u.is_vip ? st.comm_player_vip_bps : st.comm_player_bps, transfer: u.is_vip ? st.comm_transfer_vip_bps : st.comm_transfer_bps,
    },
  };
}

export async function topView(db, kind = 'balance') {
  const order = {
    balance: 'u.balance',
    garage: `(SELECT COALESCE(sum(c.price), 0) FROM user_cars uc JOIN cars c ON c.id = uc.car_id WHERE uc.user_id = u.id AND uc.status = 'owned')`,
    wins: 'u.wins',
    racers: `(SELECT count(*) FROM races WHERE status = 'done' AND winner_id = u.id)`,
  }[kind] ?? 'u.balance';
  return db.all(`SELECT u.id, u.username, u.first_name, u.photo_url, u.is_vip, u.profile_frame, ${order} AS value FROM users u
    WHERE u.id > 0 AND u.is_banned = 0 ORDER BY value DESC, u.id LIMIT 30`);
}

export async function catalogView(db) {
  const containers = await db.all('SELECT c.*, m.flag FROM containers c LEFT JOIN container_meta m ON m.container_id = c.id WHERE c.is_enabled = 1 ORDER BY c.price, c.id');
  const cars = await db.all(
    `SELECT c.*, cc.container_id, cc.weight, CASE WHEN c.exclusive = 1 THEN (SELECT count(*) FROM user_cars u WHERE u.car_id = c.id) END AS issued
     FROM cars c JOIN container_cars cc ON cc.car_id = c.id WHERE c.is_active = 1 ORDER BY c.price DESC`);
  for (const c of containers) c.chances = await chances(db, c.id);
  return { containers, cars };
}

// ---------- тексты для бота ----------
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export { esc };

// номер машины для игроков: трёхзначный code (id в базе — внутренний)
export const carNo = (c) => '№' + String(c?.code ?? c?.id ?? 0).padStart(3, '0');

export function carCardText(c, { sale = null, autoSold = null } = {}) {
  const r = RARITY[c.rarity] ?? RARITY.common;
  let t = `${r.icon} <b>${esc(c.name)}</b> · ${carNo(c)}${c.exclusive ? ' · 💎 ЭКСКЛЮЗИВ' : ''}\n<i>${r.ru}${c.country ? ' · ' + esc(c.country) : ''}</i>\n\n`;
  t += `🏁 ${c.max_speed} км/ч · 0–100 за ${(c.accel_x100 / 100).toFixed(1).replace('.', ',')} с\n`;
  t += `⚙️ ${c.power} л.с. · 🎯 управляемость ${c.handling} · 🛠 надёжность ${c.reliability}\n`;
  t += `💰 Стоимость: <b>${money(c.price)}</b>`;
  if (autoSold != null) t += `\n\n💸 Гараж полон — машина сразу продана за <b>${money(autoSold)}</b>`;
  else if (sale) t += `\n${sale.quick ? '⚡ Быстрая продажа' : '🏛 Продажа государству'}: <b>${money(sale.amount)}</b> (комиссия ${sale.rate / 100}%)`;
  return t;
}

export function roomText(v, { group = false } = {}) {
  const a = v.auction;
  const head = `🚢 <b>Аукцион · комната №${v.number}</b> · ${v.count}/${v.max} игроков\n`;
  if (!a) return head + '\nЖдём игроков…';
  const c = a.container;
  const ch = a.chances;
  const chanceLine = `⚪ ${ch.common}% · 🔵 ${ch.rare}% · 🟣 ${ch.epic}% · 🟡 ${ch.mythic}%${ch.mystic ? ` · 🔴 ${ch.mystic}%` : ''}`;
  if (a.status === 'active') {
    let t = head + `\n📦 <b>${esc(c.emoji ?? '')} ${esc(c.name)}</b>\n${chanceLine}\n\n`;
    t += a.leader ? `💵 Ставка: <b>${money(a.current)}</b> — ${esc(who(a.leader))}\n` : `💵 Стартовая цена: <b>${money(a.current)}</b>, ставок нет\n`;
    t += `⏳ Осталось: <b>${a.left} с</b> · следующая ставка от ${money(a.min_bid)}\n`;
    if (a.bids.length > 1) t += '\n' + a.bids.slice(0, 4).map((b) => `• ${esc(who(b))} — ${money(b.amount)}`).join('\n') + '\n';
    t += `\n<i>Каждая ставка запускает таймер заново. ${group ? 'Нажми кнопку, чтобы войти и поставить.' : `Без ставок ${v.kick_after} раза подряд — выход из комнаты.`}</i>`;
    return t;
  }
  let t = head + `\n📦 ${esc(c.emoji ?? '')} ${esc(c.name)} — `;
  if (a.status === 'won' && a.car) {
    const r = RARITY[a.car.rarity] ?? RARITY.common;
    t += `<b>продан</b>\n🏆 ${esc(who(a.leader))} забирает за <b>${money(a.current)}</b>\n${r.icon} Внутри: <b>${esc(a.car.name)}</b> (${r.ru}, ${money(a.car.price)})\n`;
  } else if (a.status === 'no_bids') t += 'без ставок\n';
  else t += 'отменён\n';
  if (v.status === 'open') t += `\n⏸ Следующий контейнер через ${Math.max(0, v.next_at - v.now)} с…`;
  else t += '\n🔚 Комната закрыта.';
  return t;
}

export function roomKeyboard(v, { group = false, appUrl = null, appLink = null } = {}) {
  const rows = [];
  if (v.auction?.status === 'active') {
    rows.push([500, 1000, 5000].map((x) => ({ text: `+${money(Math.max(x, v.step))}`, callback_data: `b:${v.id}:${Math.max(x, v.step)}` })));
  } else if (group) {
    rows.push([{ text: '🎮 Играть', callback_data: `j:${v.scope_id}` }]);
  }
  const app = group ? (appLink ? { text: '📱 Открыть игру', url: appLink } : null) : appUrl ? { text: '📱 Открыть игру', web_app: { url: appUrl } } : null;
  const second = [];
  if (app) second.push(app);
  if (!group) second.push({ text: '🚪 Выйти', callback_data: `l:${v.id}` });
  if (second.length) rows.push(second);
  return { inline_keyboard: rows };
}
