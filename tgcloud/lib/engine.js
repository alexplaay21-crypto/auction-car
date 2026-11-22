// lib/engine.js — игровой движок: игроки, комнаты, ставки, завершение контейнеров,
// гараж и экономика. Денежные операции — одна команда SQL, проверки и проводки делают
// триггеры (lib/ddl.js). Таймеров на платформе нет, поэтому время «догоняется» лениво:
// tick() вызывается при каждом обращении к боту или Mini App и завершает истёкшие
// контейнеры, запускает следующие.
import { MIGRATIONS } from './ddl.js';

export class GameError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

const KNOWN = /\b([A-Z][A-Z_]{2,})\b/g;
const HINTS = [
  [/balance >= 0/i, 'INSUFFICIENT_FUNDS'],
  [/qty >= 0/i, 'NO_CONTAINER'],
  [/UNIQUE.*bonus_claims/i, 'BONUS_TAKEN'],
  [/UNIQUE.*promo_uses/i, 'PROMO_USED'],
  [/UNIQUE.*garage_upgrades/i, 'BAD_TIER'],
  [/UNIQUE.*vip_grants/i, 'ALREADY_VIP'],
  [/UNIQUE.*uq_auction_active|auctions\.room_id/i, 'AUCTION_RUNNING'],
  [/UNIQUE.*promo_codes/i, 'PROMO_EXISTS'],
];
export function toGameError(e) {
  if (e instanceof GameError) return e;
  const msg = String(e?.message || e);
  for (const [re, code] of HINTS) if (re.test(msg)) return new GameError(code, msg);
  if (/constraint failed/i.test(msg)) return new GameError('CONSTRAINT', msg);
  const codes = [...msg.matchAll(KNOWN)].map((m) => m[1]).filter((c) => !['SQLITE', 'ERR_SQLITE_ERROR', 'RAISE', 'ABORT', 'CONSTRAINT_TRIGGER'].includes(c));
  return codes.length ? new GameError(codes[codes.length - 1], msg) : null;
}
async function exec(db, q, p) {
  try { return await db.run(q, p); } catch (e) { throw toGameError(e) ?? e; }
}

const NOW = '(SELECT now FROM v_now)';
// Номер из запроса: платформа не принимает NaN в параметрах SQL, поэтому проверяем заранее.
export function idOf(v) {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n <= 0) throw new GameError('BAD_INPUT');
  return n;
}
export const now = async (db) => (await db.get('SELECT now FROM v_now')).now;
const rnd = () => Math.random();

export async function migrate(db) {
  await db.run('CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)');
  const done = new Set((await db.all('SELECT id FROM schema_migrations')).map((r) => r.id));
  const applied = [];
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    // Платформа отклоняет запрос, который ничего не изменил (DROP несуществующего триггера и т. п.) —
    // для миграций это не ошибка: все их запросы идемпотентны.
    for (const s of m.statements) {
      try { await db.run(s); } catch (e) { if (!/looks like a read one/i.test(String(e?.message))) throw e; }
    }
    if (m.run) await m.run(db);
    await db.run('INSERT INTO schema_migrations (id, applied_at) VALUES (:id, unixepoch())', { ':id': m.id });
    applied.push(m.id);
  }
  return applied;
}

let settingsCache = null, settingsAt = 0;
export async function settings(db, { fresh = false } = {}) {
  if (!fresh && settingsCache && Date.now() - settingsAt < 5000) return settingsCache;
  const rows = await db.all('SELECT k, v FROM settings');
  settingsCache = Object.fromEntries(rows.map((r) => [r.k, r.v]));
  settingsAt = Date.now();
  return settingsCache;
}
export function dropSettingsCache() { settingsCache = null; }

// Уведомление игроку в личку бота (отправляется при ближайшем обращении к боту).
export async function notify(db, chatId, kind, ref) {
  await db.run(`INSERT INTO outbox (chat_id, kind, ref, created_at) VALUES (:c, :k, :r, ${NOW})`, { ':c': chatId, ':k': kind, ':r': ref });
}

// ---------- игроки ----------
export async function ensureUser(db, tg, { admin = false, ref = null } = {}) {
  const id = Number(tg?.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new GameError('BAD_USER');
  const u = await db.get('SELECT username, first_name, photo_url, is_admin FROM users WHERE id = :id', { ':id': id });
  const username = tg.username ?? null, first = tg.first_name ?? null;
  const photo = typeof tg.photo_url === 'string' && /^https:\/\//.test(tg.photo_url) ? tg.photo_url.slice(0, 500) : null;
  if (!u) {
    const r = Number(ref);
    await db.run(
      `INSERT INTO users (id, username, first_name, photo_url, is_admin, created_at, last_seen, referred_by)
       VALUES (:id, :u, :f, :p, :a, ${NOW}, ${NOW}, (SELECT id FROM users WHERE id = :r AND id > 0 AND id <> :id))
       ON CONFLICT (id) DO NOTHING`,
      { ':id': id, ':u': username, ':f': first, ':p': photo, ':a': admin ? 1 : 0, ':r': Number.isSafeInteger(r) ? r : null });
  } else if (u.username !== username || u.first_name !== first || (photo && u.photo_url !== photo) || (admin && !u.is_admin)) {
    await db.run(
      `UPDATE users SET username = :u, first_name = :f, photo_url = COALESCE(:p, photo_url), is_admin = MAX(is_admin, :a), last_seen = ${NOW} WHERE id = :id`,
      { ':id': id, ':u': username, ':f': first, ':p': photo, ':a': admin ? 1 : 0 });
  } else {
    await db.run(`UPDATE users SET last_seen = ${NOW} WHERE id = :id AND last_seen < ${NOW} - 60`, { ':id': id });
  }
  return id;
}

export async function getUser(db, id) {
  return db.get('SELECT * FROM users WHERE id = :id', { ':id': id });
}

export async function findUser(db, ref) {
  const raw = String(ref ?? '').trim().replace(/^@/, '');
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return db.get('SELECT * FROM users WHERE id = :id', { ':id': Number(raw) });
  return db.get('SELECT * FROM users WHERE lower(username) = lower(:u) LIMIT 1', { ':u': raw });
}

// ---------- случайный выбор машины ----------
export function weighted(items, w) {
  const total = items.reduce((s, x) => s + Math.max(0, w(x)), 0);
  if (total <= 0) return items[Math.floor(rnd() * items.length)];
  let roll = rnd() * total;
  for (const x of items) { roll -= Math.max(0, w(x)); if (roll < 0) return x; }
  return items[items.length - 1];
}

export async function chances(db, containerId) {
  const st = await settings(db);
  const c = await db.get('SELECT * FROM containers WHERE id = :c', { ':c': containerId });
  // редкости, которых нет в контейнере, не выпадают — их шанс 0 (иначе витрина обещала бы невозможное)
  const have = new Set((await db.all(`SELECT DISTINCT c.rarity FROM container_cars cc JOIN cars c ON c.id = cc.car_id
     WHERE cc.container_id = :c AND c.is_active = 1 AND cc.weight > 0
       AND (c.edition IS NULL OR (SELECT count(*) FROM user_cars u WHERE u.car_id = c.id) < c.edition)`, { ':c': containerId })).map((r) => r.rarity));
  const pick = (r) => (have.size && !have.has(r) ? 0 : c?.['chance_' + r] ?? st['chance_' + r] ?? 0);
  return { common: pick('common'), rare: pick('rare'), epic: pick('epic'), mythic: pick('mythic'), mystic: pick('mystic') };
}

export async function rollCar(db, containerId) {
  const pool = await db.all(
    `SELECT c.id, c.rarity, cc.weight FROM container_cars cc JOIN cars c ON c.id = cc.car_id
     WHERE cc.container_id = :c AND c.is_active = 1
       AND (c.edition IS NULL OR (SELECT count(*) FROM user_cars u WHERE u.car_id = c.id) < c.edition)`, { ':c': containerId });
  if (!pool.length) throw new GameError('CONTAINER_EMPTY');
  const ch = await chances(db, containerId);
  const rarities = [...new Set(pool.map((p) => p.rarity))];
  const rarity = weighted(rarities, (r) => ch[r] ?? 0);
  return weighted(pool.filter((p) => p.rarity === rarity), (p) => p.weight).id;
}

// ---------- комнаты ----------
// Игрок входит в последнюю открытую комнату своей очереди, где есть место; если мест
// нет — открывается следующая. В отличие от старой версии, ждать конца контейнера не
// нужно: можно ставить сразу.
export async function joinRoom(db, uid, { scope = 'global', scopeId = 0, via = 'app' } = {}) {
  const st = await settings(db);
  const u = await getUser(db, uid);
  if (!u) throw new GameError('USER_NOT_FOUND');
  if (u.is_banned) throw new GameError('USER_BANNED');
  if (scope === 'group') {
    const g = await db.get('SELECT is_active, auction_enabled FROM groups WHERE chat_id = :c', { ':c': scopeId });
    if (!g || !g.is_active || !g.auction_enabled) throw new GameError('GROUP_AUCTION_OFF');
  }
  // уже в комнате этой очереди?
  const cur = await db.get(
    `SELECT r.* FROM room_members m JOIN rooms r ON r.id = m.room_id
     WHERE m.user_id = :u AND m.left_at IS NULL AND r.scope = :s AND r.scope_id = :sid AND r.status = 'open' ORDER BY r.id DESC LIMIT 1`,
    { ':u': uid, ':s': scope, ':sid': scopeId });
  if (cur) {
    if (via === 'bot') await db.run(`UPDATE room_members SET via = 'bot' WHERE room_id = :r AND user_id = :u`, { ':r': cur.id, ':u': uid });
    await startNext(db, cur.id).catch(() => {});
    return cur.id;
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    let room = await db.get(
      `SELECT r.* FROM rooms r WHERE r.scope = :s AND r.scope_id = :sid AND r.status = 'open' AND r.stop_requested = 0
         AND (SELECT count(*) FROM room_members WHERE room_id = r.id AND left_at IS NULL) < r.max_players
       ORDER BY r.id LIMIT 1`, { ':s': scope, ':sid': scopeId });
    if (!room) {
      await db.run(
        `INSERT INTO rooms (scope, scope_id, number, max_players, created_at)
         SELECT :s, :sid, COALESCE((SELECT max(number) FROM rooms WHERE scope = :s AND scope_id = :sid), 0) + 1, :mp, ${NOW}`,
        { ':s': scope, ':sid': scopeId, ':mp': st.max_players }).catch(() => {});
      continue;
    }
    // место занимается одной командой: если комната успела заполниться — пробуем снова
    const r = await db.run(
      `INSERT INTO room_members (room_id, user_id, joined_at, via) SELECT :r, :u, ${NOW}, :v
       WHERE (SELECT count(*) FROM room_members WHERE room_id = :r AND left_at IS NULL) < :mp
       ON CONFLICT (room_id, user_id) DO UPDATE SET left_at = NULL, missed = 0, kicked = 0, joined_at = excluded.joined_at, via = excluded.via`,
      { ':r': room.id, ':u': uid, ':v': via, ':mp': room.max_players });
    if (!r.rowsAffected) continue;
    await db.run('UPDATE rooms SET rev = rev + 1 WHERE id = :r', { ':r': room.id });
    await startNext(db, room.id).catch(() => {});
    return room.id;
  }
  throw new GameError('ROOM_BUSY');
}

export async function leaveRoom(db, uid, roomId) {
  const r = await db.run(`UPDATE room_members SET left_at = ${NOW} WHERE room_id = :r AND user_id = :u AND left_at IS NULL`, { ':r': roomId, ':u': uid });
  if (r.rowsAffected) {
    await db.run('UPDATE rooms SET rev = rev + 1 WHERE id = :r', { ':r': roomId });
    // никого не осталось и нет идущего контейнера — комната закрывается
    await db.run(
      `UPDATE rooms SET status = 'closed', closed_at = ${NOW}, rev = rev + 1 WHERE id = :r AND status = 'open'
         AND NOT EXISTS (SELECT 1 FROM room_members WHERE room_id = :r AND left_at IS NULL)
         AND NOT EXISTS (SELECT 1 FROM auctions WHERE room_id = :r AND status = 'active')`, { ':r': roomId });
  }
  return r.rowsAffected > 0;
}

export async function myRoom(db, uid, { scope = 'global', scopeId = 0 } = {}) {
  return db.get(
    `SELECT r.* FROM room_members m JOIN rooms r ON r.id = m.room_id
     WHERE m.user_id = :u AND m.left_at IS NULL AND r.scope = :s AND r.scope_id = :sid AND r.status = 'open' ORDER BY r.id DESC LIMIT 1`,
    { ':u': uid, ':s': scope, ':sid': scopeId });
}

// Запуск следующего контейнера в комнате (если пауза прошла и в комнате есть игроки).
export async function startNext(db, roomId) {
  const room = await db.get(`SELECT * FROM rooms WHERE id = :r AND status = 'open' AND stop_requested = 0 AND next_at <= ${NOW}`, { ':r': roomId });
  if (!room) return null;
  const active = await db.get(`SELECT id FROM auctions WHERE room_id = :r AND status = 'active'`, { ':r': roomId });
  if (active) return active.id;
  const list = await db.all(
    `SELECT c.id, c.price FROM containers c WHERE c.is_enabled = 1
       AND EXISTS (SELECT 1 FROM container_cars cc JOIN cars x ON x.id = cc.car_id WHERE cc.container_id = c.id AND x.is_active = 1)`);
  if (!list.length) return null;
  // не повторять прошлый контейнер, если есть выбор
  const last = await db.get('SELECT container_id FROM auctions WHERE room_id = :r ORDER BY id DESC LIMIT 1', { ':r': roomId });
  const choice = list.length > 1 ? list.filter((c) => c.id !== last?.container_id) : list;
  const c = choice[Math.floor(rnd() * choice.length)];
  try {
    const r = await db.run(
      `INSERT INTO auctions (room_id, container_id, initial_bid, current_bid, started_at, ends_at)
       VALUES (:r, :c, :p, :p, ${NOW}, ${NOW} + (SELECT v FROM settings WHERE k = 'auction_timer_s'))`,
      { ':r': roomId, ':c': c.id, ':p': c.price });
    return r.lastInsertRowid;
  } catch (e) {
    const ge = toGameError(e);
    if (['AUCTION_RUNNING', 'TOO_EARLY', 'ROOM_EMPTY', 'ROOM_CLOSED'].includes(ge?.code)) return null;
    throw e;
  }
}

// Завершить истёкший контейнер: победитель получает машину, остальным — пропуск.
export async function finalize(db, auctionId) {
  const a = await db.get(`SELECT * FROM auctions WHERE id = :a AND status = 'active' AND ends_at <= ${NOW}`, { ':a': auctionId });
  if (!a) return false;
  const carId = a.leader_id ? await rollCar(db, a.container_id) : null;
  // без ставок машина тоже выбирается — её показывают всем («что было внутри»), но никому не выдают
  const shown = a.leader_id ? null : await rollCar(db, a.container_id).catch(() => null);
  const r = await db.run(
    `UPDATE auctions SET status = :s, car_id = :car, shown_car_id = :shown, ended_at = ${NOW} WHERE id = :a AND status = 'active' AND ends_at <= ${NOW}`,
    { ':s': a.leader_id ? 'won' : 'no_bids', ':car': carId, ':shown': shown, ':a': a.id }).catch((e) => { throw toGameError(e) ?? e; });
  return r.rowsAffected > 0;
}

// Ленивое «тиканье» времени: вызывается при каждом обращении.
export async function tick(db, { limit = 10 } = {}) {
  let n = 0;
  const due = await db.all(`SELECT id FROM auctions WHERE status = 'active' AND ends_at <= ${NOW} ORDER BY ends_at LIMIT :n`, { ':n': limit });
  for (const a of due) { try { if (await finalize(db, a.id)) n++; } catch (e) { console.warn('finalize', a.id, String(e?.code ?? e?.message ?? e)); } }
  const rooms = await db.all(
    `SELECT r.id FROM rooms r WHERE r.status = 'open' AND r.stop_requested = 0 AND r.next_at <= ${NOW}
       AND NOT EXISTS (SELECT 1 FROM auctions WHERE room_id = r.id AND status = 'active')
       AND EXISTS (SELECT 1 FROM room_members WHERE room_id = r.id AND left_at IS NULL) LIMIT :n`, { ':n': limit });
  for (const r of rooms) { try { if (await startNext(db, r.id)) n++; } catch (e) { console.warn('start', r.id, String(e?.code ?? e?.message ?? e)); } }
  // пустые комнаты без контейнера закрываются
  await db.run(
    `UPDATE rooms SET status = 'closed', closed_at = ${NOW}, rev = rev + 1 WHERE status = 'open'
       AND (stop_requested = 1 OR (created_at < ${NOW} - 60 AND NOT EXISTS (SELECT 1 FROM room_members WHERE room_id = rooms.id AND left_at IS NULL)))
       AND NOT EXISTS (SELECT 1 FROM auctions WHERE room_id = rooms.id AND status = 'active')`);
  return n;
}

// ---------- ставки ----------
export async function bid(db, uid, roomId, { amount = null, raise = null, opId }) {
  await tick(db);
  const a = await db.get(`SELECT * FROM auctions WHERE room_id = :r AND status = 'active'`, { ':r': roomId });
  if (!a) throw new GameError('AUCTION_OVER');
  const st = await settings(db);
  let value = amount != null ? Math.floor(Number(amount)) : a.current_bid + Math.max(st.bet_step, Math.floor(Number(raise) || st.bet_step));
  if (!Number.isSafeInteger(value) || value <= 0) throw new GameError('BAD_AMOUNT');
  if (!opId || String(opId).length > 80) throw new GameError('BAD_INPUT');
  const op = `bid:${uid}:${opId}`;
  const done = await db.get('SELECT * FROM bids WHERE op_id = :op', { ':op': op });
  if (done) return { auction: await db.get('SELECT * FROM auctions WHERE id = :a', { ':a': done.auction_id }), replay: true };
  await exec(db, `INSERT INTO bids (op_id, auction_id, user_id, amount, created_at) VALUES (:op, :a, :u, :v, ${NOW})`,
    { ':op': op, ':a': a.id, ':u': uid, ':v': value });
  return { auction: await db.get('SELECT * FROM auctions WHERE id = :a', { ':a': a.id }), replay: false };
}

export function minBid(a, st) { return a.current_bid + st.bet_step; }

// ---------- гараж ----------
export async function sellRate(db, uid, userCarId) {
  const r = await db.get(
    `SELECT uc.obtained_at, c.price, u.is_vip FROM user_cars uc JOIN cars c ON c.id = uc.car_id JOIN users u ON u.id = uc.user_id
     WHERE uc.id = :id AND uc.user_id = :u AND uc.status = 'owned'`, { ':id': userCarId, ':u': uid });
  if (!r) throw new GameError('CAR_NOT_FOUND');
  const st = await settings(db);
  const t = await now(db);
  const win = r.is_vip ? (st.quick_sell_window_vip_s ?? st.quick_sell_window_s) : st.quick_sell_window_s;
  const quick = t - r.obtained_at <= win;
  const rate = quick ? (r.is_vip ? st.comm_quick_vip_bps : st.comm_quick_bps) : (r.is_vip ? st.comm_state_vip_bps : st.comm_state_bps);
  return { quick, rate, amount: Math.floor((r.price * (10000 - rate)) / 10000), price: r.price, quickUntil: r.obtained_at + win, window: win };
}

export async function sellCar(db, uid, userCarId) {
  const q = await sellRate(db, uid, userCarId);
  await exec(db, `INSERT INTO car_sales (user_car_id, user_id, amount, rate_bps, created_at) VALUES (:c, :u, :a, :r, ${NOW})`,
    { ':c': userCarId, ':u': uid, ':a': q.amount, ':r': q.rate });
  return q;
}

export async function upgradeGarage(db, uid) {
  const u = await getUser(db, uid);
  const st = await settings(db);
  const base = u.garage_capacity - (u.is_vip ? st.garage_vip_bonus : 0);
  const tier = await db.get('SELECT capacity, price FROM garage_tiers WHERE capacity > :b ORDER BY capacity LIMIT 1', { ':b': base });
  if (!tier || tier.capacity > st.garage_max) throw new GameError('GARAGE_MAX');
  await exec(db, `INSERT INTO garage_upgrades (user_id, capacity, price, created_at) VALUES (:u, :c, :p, ${NOW})`,
    { ':u': uid, ':c': tier.capacity, ':p': tier.price });
  return tier;
}

export async function nextTier(db, u) {
  const st = await settings(db);
  const base = u.garage_capacity - (u.is_vip ? st.garage_vip_bonus : 0);
  const t = await db.get('SELECT capacity, price FROM garage_tiers WHERE capacity > :b ORDER BY capacity LIMIT 1', { ':b': base });
  if (!t || t.capacity > st.garage_max) return null;
  return { ...t, total: t.capacity + (u.is_vip ? st.garage_vip_bonus : 0) };
}

export async function openContainer(db, uid, containerId, opId) {
  const op = `open:${uid}:${opId}`;
  const done = await db.get('SELECT * FROM container_opens WHERE op_id = :op', { ':op': op });
  if (done) return done;
  const carId = await rollCar(db, containerId);
  await exec(db, `INSERT INTO container_opens (op_id, user_id, container_id, car_id, created_at) VALUES (:op, :u, :c, :car, ${NOW})`,
    { ':op': op, ':u': uid, ':c': containerId, ':car': carId });
  return db.get('SELECT * FROM container_opens WHERE op_id = :op', { ':op': op });
}

// ---------- экономика ----------
export async function transfer(db, uid, toRef, amount, opId) {
  const to = await findUser(db, toRef);
  if (!to || to.id <= 0) throw new GameError('RECIPIENT_NOT_FOUND');
  if (to.id === uid) throw new GameError('SELF_TRANSFER');
  const a = Math.floor(Number(amount));
  if (!Number.isSafeInteger(a) || a <= 0) throw new GameError('BAD_AMOUNT');
  const u = await getUser(db, uid);
  const st = await settings(db);
  const commission = Math.floor((a * (u.is_vip ? st.comm_transfer_vip_bps : st.comm_transfer_bps)) / 10000);
  const op = `tr:${uid}:${opId}`;
  const done = await db.get('SELECT * FROM transfers WHERE op_id = :op', { ':op': op });
  if (done) return { ...done, to };
  const r = await exec(db, `INSERT INTO transfers (op_id, from_id, to_id, amount, commission, created_at) VALUES (:op, :f, :t, :a, :c, ${NOW})`,
    { ':op': op, ':f': uid, ':t': to.id, ':a': a, ':c': commission });
  await notify(db, to.id, 'transfer', r.lastInsertRowid);
  return { amount: a, commission, net: a - commission, to };
}

// Бонус раз в 4 часа: $5 000 (VIP $10 000). Не выдаётся, если на балансе уже от $50 000
// (VIP — от $100 000): бонус — помощь тем, у кого мало денег.
export async function bonusState(db, uid) {
  const u = await getUser(db, uid);
  const st = await settings(db);
  const t = await now(db);
  const last = (await db.get('SELECT max(created_at) AS t FROM bonus4 WHERE user_id = :u', { ':u': uid }))?.t ?? 0;
  const cap = u.is_vip ? st.bonus_cap_vip : st.bonus_cap;
  const next = last + st.bonus_period_s;
  const rich = u.balance >= cap;
  return { available: t >= next && !rich, rich, cap, amount: u.is_vip ? st.daily_bonus_vip : st.daily_bonus, next_at: Math.max(next, t), period: st.bonus_period_s, now: t };
}

export async function claimBonus(db, uid) {
  const b = await bonusState(db, uid);
  if (b.rich) throw new GameError('BONUS_RICH');
  if (!b.available) throw new GameError('BONUS_TOO_EARLY');
  await exec(db, `INSERT INTO bonus4 (user_id, amount, created_at) VALUES (:u, :a, ${NOW})`, { ':u': uid, ':a': b.amount });
  return b;
}

// VIP продаётся только за звёзды (lib/stars.js).
export async function buyVip(db, uid) {
  if (uid) throw new GameError('STARS_ONLY');
  const st = await settings(db);
  await exec(db, `INSERT INTO vip_grants (user_id, source, price, created_at) VALUES (:u, 'purchase', :p, ${NOW})`, { ':u': uid, ':p': st.vip_price });
  return st.vip_price;
}

// Продажа машины игроку: предложение → покупатель принимает или отклоняет.
export async function offerCar(db, uid, userCarId, buyerRef, price) {
  const buyer = await findUser(db, buyerRef);
  if (!buyer) throw new GameError('BUYER_NOT_FOUND');
  const p = Math.floor(Number(price));
  if (!Number.isSafeInteger(p) || p <= 0) throw new GameError('BAD_AMOUNT');
  const u = await getUser(db, uid);
  const st = await settings(db);
  await db.run(`UPDATE sale_offers SET status = 'expired', resolved_at = ${NOW} WHERE user_car_id = :c AND status = 'pending' AND expires_at <= ${NOW}`, { ':c': userCarId });
  const r = await exec(db,
    `INSERT INTO sale_offers (seller_id, buyer_id, user_car_id, price, rate_bps, created_at, expires_at)
     VALUES (:s, :b, :c, :p, :r, ${NOW}, ${NOW} + (SELECT v FROM settings WHERE k = 'sale_offer_ttl_s'))`,
    { ':s': uid, ':b': buyer.id, ':c': userCarId, ':p': p, ':r': u.is_vip ? st.comm_player_vip_bps : st.comm_player_bps });
  await notify(db, buyer.id, 'offer', r.lastInsertRowid);
  return { id: r.lastInsertRowid, buyer };
}

export async function answerOffer(db, uid, offerId, accept) {
  const o = await db.get('SELECT * FROM sale_offers WHERE id = :o', { ':o': offerId });
  if (!o || (accept && o.buyer_id !== uid) || (!accept && o.buyer_id !== uid && o.seller_id !== uid)) throw new GameError('OFFER_NOT_FOUND');
  const status = accept ? 'accepted' : o.seller_id === uid ? 'cancelled' : 'declined';
  const r = await exec(db, `UPDATE sale_offers SET status = :s, resolved_at = ${NOW} WHERE id = :o AND status = 'pending'`, { ':s': status, ':o': offerId });
  if (!r.rowsAffected) throw new GameError('OFFER_CLOSED');
  if (status !== 'cancelled') await notify(db, o.seller_id, 'offer_done', o.id);
  return { ...o, status };
}

export async function redeemPromo(db, uid, code) {
  const c = String(code ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,32}$/.test(c)) throw new GameError('PROMO_NOT_FOUND');
  await exec(db, `INSERT INTO promo_uses (code, user_id, created_at) VALUES (:c, :u, ${NOW})`, { ':c': c, ':u': uid });
  return db.get('SELECT * FROM promo_codes WHERE code = :c', { ':c': c });
}

export async function buyLot(db, uid, lotId, opId) {
  const lot = await db.get('SELECT * FROM shop_lots WHERE id = :l AND is_available = 1', { ':l': lotId });
  if (!lot) throw new GameError('ITEM_UNAVAILABLE');
  const op = `shop:${uid}:${opId}`;
  const done = await db.get('SELECT * FROM shop_purchases WHERE op_id = :op', { ':op': op });
  if (done) return { lot, replay: true };
  await exec(db, `INSERT INTO shop_purchases (op_id, user_id, lot_id, price, car_id, created_at) VALUES (:op, :u, :l, :p, :car, ${NOW})`,
    { ':op': op, ':u': uid, ':l': lot.id, ':p': lot.price, ':car': lot.car_id });
  return { lot, replay: false };
}

// Эпическая машина за каждые N приглашённых (машину выбирает код, триггер проверяет право).
export async function referralRewards(db, uid) {
  const u = await getUser(db, uid);
  const st = await settings(db);
  const due = Math.floor(u.referrals_count / st.ref_epic_every);
  const got = (await db.get(`SELECT count(*) AS n FROM car_grants WHERE user_id = :u AND source = 'referral'`, { ':u': uid })).n;
  let n = 0;
  for (let i = got; i < due; i++) {
    const epics = await db.all(`SELECT id FROM cars WHERE rarity = 'epic' AND is_active = 1`);
    if (!epics.length) break;
    const car = epics[Math.floor(rnd() * epics.length)];
    await exec(db, `INSERT INTO car_grants (op_id, user_id, car_id, source, created_at) VALUES (:op, :u, :c, 'referral', ${NOW})`,
      { ':op': `ref-epic:${uid}:${i + 1}`, ':u': uid, ':c': car.id }).catch(() => {});
    n++;
  }
  return n;
}

// ---------- админ ----------
export async function adminAdjust(db, adminId, userId, delta, reason, opId) {
  await exec(db, `INSERT INTO admin_adjusts (op_id, admin_id, user_id, delta, reason, created_at) VALUES (:op, :a, :u, :d, :r, ${NOW})`,
    { ':op': `adj:${adminId}:${opId}`, ':a': adminId, ':u': userId, ':d': Math.trunc(delta), ':r': reason ?? null });
}

export async function adminLog(db, adminId, action, details) {
  await db.run(`INSERT INTO admin_log (admin_id, action, details, created_at) VALUES (:a, :ac, :d, ${NOW})`,
    { ':a': adminId, ':ac': action, ':d': typeof details === 'string' ? details : JSON.stringify(details ?? null) });
}

// ---------- проверка целостности ----------
export async function audit(db) {
  const problems = [];
  const bad = await db.all(
    `SELECT u.id, u.balance, COALESCE((SELECT sum(delta) FROM ledger WHERE user_id = u.id), 0) AS ledger FROM users u
     WHERE u.balance <> COALESCE((SELECT sum(delta) FROM ledger WHERE user_id = u.id), 0) LIMIT 10`);
  for (const b of bad) problems.push({ kind: 'balance_mismatch', ...b });
  const neg = await db.get('SELECT count(*) AS n FROM users WHERE balance < 0');
  if (neg.n) problems.push({ kind: 'negative_balance', n: neg.n });
  const dup = await db.all(`SELECT room_id, count(*) AS n FROM auctions WHERE status = 'active' GROUP BY room_id HAVING n > 1`);
  for (const d of dup) problems.push({ kind: 'double_active_auction', ...d });
  // залог: у каждого лидера активного контейнера списана его текущая ставка
  const esc = await db.all(
    `SELECT a.id, a.leader_id, a.current_bid,
            -COALESCE((SELECT sum(delta) FROM ledger WHERE ref = a.id AND user_id = a.leader_id AND kind IN ('bid', 'bid_refund')), 0) AS held
     FROM auctions a WHERE a.leader_id IS NOT NULL AND a.status IN ('active', 'won')
       AND a.current_bid <> -COALESCE((SELECT sum(delta) FROM ledger WHERE ref = a.id AND user_id = a.leader_id AND kind IN ('bid', 'bid_refund')), 0)
     LIMIT 10`);
  for (const e of esc) problems.push({ kind: 'escrow_mismatch', ...e });
  const loser = await db.all(
    `SELECT l.ref AS auction_id, l.user_id, sum(l.delta) AS net FROM ledger l JOIN auctions a ON a.id = l.ref
     WHERE l.kind IN ('bid', 'bid_refund') AND l.user_id IS NOT a.leader_id GROUP BY l.ref, l.user_id HAVING net <> 0 LIMIT 10`);
  for (const e of loser) problems.push({ kind: 'loser_not_refunded', ...e });
  const over = await db.all(
    `SELECT u.id, u.garage_capacity, (SELECT count(*) FROM user_cars WHERE user_id = u.id AND status = 'owned') AS owned
     FROM users u WHERE (SELECT count(*) FROM user_cars WHERE user_id = u.id AND status = 'owned') > u.garage_capacity LIMIT 10`);
  for (const o of over) problems.push({ kind: 'garage_over_capacity', ...o });
  return problems;
}
