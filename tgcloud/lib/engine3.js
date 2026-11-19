// lib/engine3.js — гонки, навык гонщика, рынок, Battle Pass, друзья, профили игроков,
// динамические цены контейнеров. Деньги проводят триггеры миграции 3 (lib/ddl3.js).
import { GameError, toGameError, settings, getUser, findUser, now } from './engine.js';
import { runTime, pickBot, TRACKS } from './race.js';
import { reaction, skillPrice, SKILL_MAX } from './ddl3.js';

const NOW = '(SELECT now FROM v_now)';
async function exec(db, q, p) { try { return await db.run(q, p); } catch (e) { throw toGameError(e) ?? e; } }
const intOf = (v, min, max) => {
  const n = Math.floor(Number(v));
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new GameError('BAD_AMOUNT');
  return n;
};

// ---------- навык гонщика ----------
export async function skillOf(db, uid) {
  return (await db.get('SELECT purchases FROM racer_skill WHERE user_id = :u', { ':u': uid }))?.purchases ?? 0;
}
export async function skillView(db, uid) {
  const p = await skillOf(db, uid);
  const u = await getUser(db, uid);
  const next = (k) => (p + k <= SKILL_MAX ? Array.from({ length: k }, (_, i) => skillPrice(p + i + 1)).reduce((a, b) => a + b, 0) : null);
  return {
    purchases: p, max: SKILL_MAX, level: Math.floor(p / 4), max_level: SKILL_MAX / 4,
    reaction: reaction(p), next_reaction: p < SKILL_MAX ? reaction(p + 1) : null, reaction10: p + 10 <= SKILL_MAX ? reaction(p + 10) : null,
    price1: next(1), price10: next(10), balance: u.balance, best: 0.2,
  };
}
export async function buySkill(db, uid, count, opId) {
  const c = intOf(count, 1, 10);
  const p = await skillOf(db, uid);
  if (p + c > SKILL_MAX) throw new GameError('SKILL_MAX');
  const price = Array.from({ length: c }, (_, i) => skillPrice(p + i + 1)).reduce((a, b) => a + b, 0);
  await exec(db, `INSERT INTO skill_buys (op_id, user_id, from_p, count, price, created_at) VALUES (:op, :u, :p, :c, :pr, ${NOW})`,
    { ':op': `skill:${uid}:${opId}`, ':u': uid, ':p': p, ':c': c, ':pr': price });
  return skillView(db, uid);
}

// ---------- гонки ----------
async function myCar(db, uid, userCarId) {
  const c = await db.get(
    `SELECT uc.id AS user_car_id, c.* FROM user_cars uc JOIN cars c ON c.id = uc.car_id WHERE uc.id = :i AND uc.user_id = :u AND uc.status = 'owned'`,
    { ':i': Number(userCarId) || 0, ':u': uid });
  if (!c) throw new GameError('CAR_NOT_FOUND');
  return c;
}
const trackOf = (t) => { if (!TRACKS[t]) throw new GameError('BAD_TRACK'); return t; };

export async function raceBot(db, uid, { carId, track, stake, opId }) {
  const st = await settings(db);
  const s = intOf(stake, st.race_min_stake, st.race_max_stake);
  const tr = trackOf(track);
  const car = await myCar(db, uid, carId);
  const op = `race:${uid}:${opId}`;
  const done = await db.get('SELECT id FROM races WHERE op_id = :op', { ':op': op });
  if (done) return raceView(db, done.id);
  const cars = await db.all('SELECT * FROM cars WHERE is_active = 1');
  const bot = pickBot(cars, car);
  const me = runTime(car, tr, reaction(await skillOf(db, uid)));
  const them = runTime(bot.car, tr, bot.reaction);
  const r = await exec(db,
    `INSERT INTO races (op_id, kind, track, status, stake, host_id, host_car, host_ms, guest_ms, bot_car, winner_id, created_at, resolved_at)
     VALUES (:op, 'bot', :t, 'done', :s, :u, :hc, :hm, :gm, :bc, :w, ${NOW}, ${NOW})`,
    { ':op': op, ':t': tr, ':s': s, ':u': uid, ':hc': car.user_car_id, ':hm': me.ms, ':gm': them.ms, ':bc': bot.car.id, ':w': me.ms < them.ms ? uid : null });
  return { ...(await raceView(db, r.lastInsertRowid)), glitch: { host: me.glitch, guest: them.glitch } };
}

export async function raceCreate(db, uid, { carId, track, stake, opId }) {
  const st = await settings(db);
  const s = intOf(stake, st.race_min_stake, st.race_max_stake);
  const car = await myCar(db, uid, carId);
  const op = `race:${uid}:${opId}`;
  const done = await db.get('SELECT id FROM races WHERE op_id = :op', { ':op': op });
  if (done) return raceView(db, done.id);
  const r = await exec(db,
    `INSERT INTO races (op_id, kind, track, status, stake, host_id, host_car, created_at) VALUES (:op, 'pvp', :t, 'open', :s, :u, :c, ${NOW})`,
    { ':op': op, ':t': trackOf(track), ':s': s, ':u': uid, ':c': car.user_car_id });
  return raceView(db, r.lastInsertRowid);
}

export async function raceAccept(db, uid, raceId, carId) {
  const race = await db.get(`SELECT * FROM races WHERE id = :r AND status = 'open'`, { ':r': Number(raceId) || 0 });
  if (!race) throw new GameError('RACE_CLOSED');
  if (race.host_id === uid) throw new GameError('SELF_RACE');
  const guestCar = await myCar(db, uid, carId);
  const hostCar = await db.get(
    `SELECT c.* FROM user_cars uc JOIN cars c ON c.id = uc.car_id WHERE uc.id = :i AND uc.user_id = :u AND uc.status = 'owned'`, { ':i': race.host_car, ':u': race.host_id });
  if (!hostCar) {
    await db.run(`UPDATE races SET status = 'cancelled', resolved_at = ${NOW} WHERE id = :r AND status = 'open'`, { ':r': race.id });
    throw new GameError('HOST_CAR_GONE');
  }
  const h = runTime(hostCar, race.track, reaction(await skillOf(db, race.host_id)));
  const g = runTime(guestCar, race.track, reaction(await skillOf(db, uid)));
  const r = await exec(db,
    `UPDATE races SET status = 'done', guest_id = :g, guest_car = :gc, host_ms = :hm, guest_ms = :gm, winner_id = :w, resolved_at = ${NOW}
     WHERE id = :r AND status = 'open'`,
    { ':g': uid, ':gc': guestCar.user_car_id, ':hm': h.ms, ':gm': g.ms, ':w': h.ms <= g.ms ? race.host_id : uid, ':r': race.id });
  if (!r.rowsAffected) throw new GameError('RACE_CLOSED');
  await db.run(`INSERT INTO outbox (chat_id, kind, ref, created_at) VALUES (:c, 'race', :r, ${NOW})`, { ':c': race.host_id, ':r': race.id });
  return { ...(await raceView(db, race.id)), glitch: { host: h.glitch, guest: g.glitch } };
}

export async function raceCancel(db, uid, raceId) {
  const r = await exec(db, `UPDATE races SET status = 'cancelled', resolved_at = ${NOW} WHERE id = :r AND host_id = :u AND status = 'open'`,
    { ':r': Number(raceId) || 0, ':u': uid });
  if (!r.rowsAffected) throw new GameError('RACE_CLOSED');
}

const CAR_COLS = 'id, name, rarity, color, body, max_speed, accel_x100, power, handling, reliability, price, country';
export async function raceView(db, id) {
  const r = await db.get('SELECT * FROM races WHERE id = :r', { ':r': id });
  if (!r) return null;
  const userOf = (u) => (u ? db.get('SELECT id, username, first_name, photo_url, is_vip FROM users WHERE id = :u', { ':u': u }) : null);
  const carOfUc = (uc) => (uc ? db.get(`SELECT c.${CAR_COLS.split(', ').join(', c.')} FROM user_cars uc JOIN cars c ON c.id = uc.car_id WHERE uc.id = :i`, { ':i': uc }) : null);
  const st = await settings(db);
  return {
    ...r, track_name: TRACKS[r.track].name,
    host: await userOf(r.host_id), guest: await userOf(r.guest_id),
    host_car_info: await carOfUc(r.host_car),
    guest_car_info: r.bot_car ? await db.get(`SELECT ${CAR_COLS} FROM cars WHERE id = :c`, { ':c': r.bot_car }) : await carOfUc(r.guest_car),
    payout: r.kind === 'bot' ? Math.floor((r.stake * st.race_bot_win_bps) / 10000) : Math.floor((r.stake * 2 * (10000 - st.race_pvp_fee_bps)) / 10000),
  };
}

export async function racesView(db, uid) {
  const st = await settings(db);
  const open = await db.all(`SELECT id FROM races WHERE status = 'open' ORDER BY id DESC LIMIT 30`);
  const mine = await db.all(`SELECT id FROM races WHERE (host_id = :u OR guest_id = :u) ORDER BY id DESC LIMIT 15`, { ':u': uid });
  const stats = await db.get(
    `SELECT count(*) AS n, COALESCE(sum(winner_id = :u), 0) AS wins FROM races WHERE status = 'done' AND (host_id = :u OR guest_id = :u)`, { ':u': uid });
  return {
    tracks: Object.entries(TRACKS).map(([k, t]) => ({ id: k, name: t.name, weights: t.w })),
    open: await Promise.all(open.map((x) => raceView(db, x.id))),
    mine: await Promise.all(mine.map((x) => raceView(db, x.id))),
    stats, skill: await skillView(db, uid),
    limits: { min: st.race_min_stake, max: st.race_max_stake, bot_win_bps: st.race_bot_win_bps, fee_bps: st.race_pvp_fee_bps },
  };
}

// ---------- рынок ----------
export async function listCar(db, uid, userCarId, price) {
  const p = intOf(price, 1, 1e12);
  const u = await getUser(db, uid);
  const st = await settings(db);
  const r = await exec(db, `INSERT INTO market_listings (seller_id, user_car_id, price, rate_bps, created_at) VALUES (:s, :c, :p, :r, ${NOW})`,
    { ':s': uid, ':c': Number(userCarId) || 0, ':p': p, ':r': u.is_vip ? st.comm_player_vip_bps : st.comm_player_bps });
  return { id: r.lastInsertRowid };
}
export async function unlistCar(db, uid, listingId) {
  const r = await exec(db, `UPDATE market_listings SET status = 'cancelled', resolved_at = ${NOW} WHERE id = :l AND seller_id = :u AND status = 'open'`,
    { ':l': Number(listingId) || 0, ':u': uid });
  if (!r.rowsAffected) throw new GameError('LISTING_CLOSED');
}
export async function buyListing(db, uid, listingId) {
  const l = await db.get(`SELECT * FROM market_listings WHERE id = :l AND status = 'open'`, { ':l': Number(listingId) || 0 });
  if (!l) throw new GameError('LISTING_CLOSED');
  const r = await exec(db, `UPDATE market_listings SET status = 'sold', buyer_id = :u, resolved_at = ${NOW} WHERE id = :l AND status = 'open'`, { ':u': uid, ':l': l.id });
  if (!r.rowsAffected) throw new GameError('LISTING_CLOSED');
  await db.run(`INSERT INTO outbox (chat_id, kind, ref, created_at) VALUES (:c, 'market_sold', :l, ${NOW})`, { ':c': l.seller_id, ':l': l.id });
  return l;
}
export async function marketView(db, uid, { rarity = null, country = null, sort = 'new', mine = false } = {}) {
  const where = [`l.status = 'open'`];
  const p = {};
  if (rarity) { where.push('c.rarity = :r'); p[':r'] = rarity; }
  if (country) { where.push('c.country = :co'); p[':co'] = country; }
  if (mine) { where.push('l.seller_id = :u'); p[':u'] = uid; }
  const order = { new: 'l.id DESC', cheap: 'l.price ASC', expensive: 'l.price DESC', deal: 'CAST(l.price AS REAL) / c.price ASC' }[sort] ?? 'l.id DESC';
  const rows = await db.all(
    `SELECT l.id AS listing_id, l.price AS ask, l.seller_id, l.created_at AS listed_at, uc.id AS user_car_id,
            u.username, u.first_name, u.photo_url, u.is_vip, c.*
     FROM market_listings l JOIN user_cars uc ON uc.id = l.user_car_id JOIN cars c ON c.id = uc.car_id JOIN users u ON u.id = l.seller_id
     WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 60`, p);
  const sold = await db.all(
    `SELECT l.price, l.resolved_at, c.name, c.rarity FROM market_listings l JOIN user_cars uc ON uc.id = l.user_car_id JOIN cars c ON c.id = uc.car_id
     WHERE l.status = 'sold' ORDER BY l.resolved_at DESC LIMIT 10`);
  return { list: rows.map((r) => ({ ...r, seller: { id: r.seller_id, username: r.username, first_name: r.first_name, photo_url: r.photo_url, is_vip: r.is_vip } })), sold, me: uid };
}

// ---------- динамические цены контейнеров ----------
export async function containerPrices(db) {
  const rows = await db.all(
    `SELECT c.id, c.name, c.emoji, c.country, c.price, m.base_price, m.prev_price, m.flag FROM containers c LEFT JOIN container_meta m ON m.container_id = c.id
     WHERE c.is_enabled = 1 ORDER BY c.id`);
  for (const r of rows) {
    r.history = (await db.all('SELECT price FROM container_prices WHERE container_id = :c ORDER BY id DESC LIMIT 20', { ':c': r.id })).map((x) => x.price).reverse();
    r.change = r.prev_price ? Math.round(((r.price - r.prev_price) / r.prev_price) * 1000) / 10 : 0;
    r.vs_base = r.base_price ? Math.round(((r.price - r.base_price) / r.base_price) * 1000) / 10 : 0;
  }
  return rows;
}

// ---------- Battle Pass ----------
export async function bpView(db, uid) {
  const st = await settings(db);
  const season = st.bp_season;
  const pr = (await db.get('SELECT xp, premium FROM bp_progress WHERE user_id = :u AND season = :s', { ':u': uid, ':s': season })) ?? { xp: 0, premium: 0 };
  const levels = await db.all('SELECT * FROM bp_levels WHERE season = :s ORDER BY level', { ':s': season });
  const claims = await db.all('SELECT level, track FROM bp_claims WHERE user_id = :u AND season = :s', { ':u': uid, ':s': season });
  const got = new Set(claims.map((c) => `${c.level}:${c.track}`));
  const containers = Object.fromEntries((await db.all('SELECT id, name, emoji FROM containers')).map((c) => [c.id, c]));
  const level = Math.min(levels.length, Math.floor(pr.xp / st.bp_xp_level));
  return {
    season, xp: pr.xp, premium: pr.premium === 1, level, per_level: st.bp_xp_level, price: st.bp_price,
    levels: levels.map((l) => ({
      level: l.level, unlocked: pr.xp >= l.level * st.bp_xp_level,
      free: { kind: l.free_kind, value: l.free_value, claimed: got.has(`${l.level}:free`), container: containers[l.free_value] ?? null },
      premium: { kind: l.prem_kind, value: l.prem_value, claimed: got.has(`${l.level}:premium`), container: containers[l.prem_value] ?? null },
    })),
    xp_rules: [['Ставка', 10], ['Победа на аукционе', 150], ['Открыть контейнер', 150], ['Ежедневный бонус', 100], ['Гонка', 60], ['Победа в гонке', 100], ['Сделка на рынке', 50]],
  };
}
export async function bpBuy(db, uid) {
  const st = await settings(db);
  await exec(db, `INSERT INTO bp_purchases (user_id, season, price, created_at) VALUES (:u, :s, :p, ${NOW})`, { ':u': uid, ':s': st.bp_season, ':p': st.bp_price });
}
export async function bpClaim(db, uid, level, track) {
  const st = await settings(db);
  const l = await db.get('SELECT * FROM bp_levels WHERE season = :s AND level = :l', { ':s': st.bp_season, ':l': Number(level) || 0 });
  if (!l) throw new GameError('BAD_CLAIM');
  const t = track === 'premium' ? 'premium' : 'free';
  const kind = t === 'free' ? l.free_kind : l.prem_kind, value = t === 'free' ? l.free_value : l.prem_value;
  let carId = null;
  if (kind === 'car') {
    const rarity = { 1: 'rare', 2: 'epic', 3: 'mythic' }[value];
    const list = await db.all('SELECT id FROM cars WHERE rarity = :r AND is_active = 1', { ':r': rarity });
    if (!list.length) throw new GameError('CONTAINER_EMPTY');
    carId = list[Math.floor(Math.random() * list.length)].id;
  }
  await exec(db, `INSERT INTO bp_claims (user_id, season, level, track, car_id, created_at) VALUES (:u, :s, :l, :t, :c, ${NOW})`,
    { ':u': uid, ':s': st.bp_season, ':l': l.level, ':t': t, ':c': carId });
  return { kind, value, car: carId ? await db.get('SELECT * FROM cars WHERE id = :c', { ':c': carId }) : null };
}

// ---------- друзья ----------
export async function addFriend(db, uid, ref) {
  const f = typeof ref === 'number' ? await getUser(db, ref) : await findUser(db, ref);
  if (!f || f.id <= 0) throw new GameError('USER_NOT_FOUND');
  if (f.id === uid) throw new GameError('SELF_FRIEND');
  await exec(db, `INSERT INTO friends (user_id, friend_id, created_at) VALUES (:u, :f, ${NOW}) ON CONFLICT DO NOTHING`, { ':u': uid, ':f': f.id });
  return f;
}
export async function removeFriend(db, uid, id) {
  await db.run('DELETE FROM friends WHERE user_id = :u AND friend_id = :f', { ':u': uid, ':f': Number(id) || 0 });
}
const PUB = 'u.id, u.username, u.first_name, u.photo_url, u.is_vip, u.last_seen';
// Друзья для быстрого выбора: мои друзья, приглашённые/пригласивший и с кем недавно были сделки.
export async function friendsView(db, uid) {
  const friends = await db.all(`SELECT ${PUB}, 'friend' AS why FROM friends f JOIN users u ON u.id = f.friend_id WHERE f.user_id = :u ORDER BY u.last_seen DESC`, { ':u': uid });
  const refs = await db.all(
    `SELECT ${PUB}, 'referral' AS why FROM referrals r JOIN users u ON u.id = CASE WHEN r.inviter_id = :u THEN r.invited_id ELSE r.inviter_id END
     WHERE r.inviter_id = :u OR r.invited_id = :u`, { ':u': uid });
  const recent = await db.all(
    `SELECT ${PUB}, 'recent' AS why FROM (
       SELECT to_id AS other, max(created_at) AS t FROM transfers WHERE from_id = :u GROUP BY to_id
       UNION ALL SELECT from_id, max(created_at) FROM transfers WHERE to_id = :u GROUP BY from_id
       UNION ALL SELECT buyer_id, max(created_at) FROM sale_offers WHERE seller_id = :u GROUP BY buyer_id
       UNION ALL SELECT CASE WHEN host_id = :u THEN guest_id ELSE host_id END, max(created_at) FROM races WHERE kind = 'pvp' AND status = 'done' AND (host_id = :u OR guest_id = :u) GROUP BY 1
     ) x JOIN users u ON u.id = x.other WHERE u.id <> :u GROUP BY u.id ORDER BY max(x.t) DESC LIMIT 15`, { ':u': uid });
  const seen = new Set();
  const pick = [...friends, ...refs, ...recent].filter((x) => (seen.has(x.id) ? false : seen.add(x.id)));
  return { friends, referrals: refs, recent, pick };
}

// ---------- профиль игрока (свой или чужой) ----------
export async function playerView(db, viewerId, targetId) {
  const u = await getUser(db, Number(targetId) || 0);
  if (!u || u.id <= 0) throw new GameError('USER_NOT_FOUND');
  const st = await settings(db);
  const g = await db.get(`SELECT count(*) AS n, COALESCE(sum(c.price), 0) AS v FROM user_cars uc JOIN cars c ON c.id = uc.car_id WHERE uc.user_id = :u AND uc.status = 'owned'`, { ':u': u.id });
  const cars = await db.all(
    `SELECT uc.id AS user_car_id, c.*, (SELECT id FROM market_listings WHERE user_car_id = uc.id AND status = 'open') AS listing_id,
            (SELECT price FROM market_listings WHERE user_car_id = uc.id AND status = 'open') AS ask
     FROM user_cars uc JOIN cars c ON c.id = uc.car_id WHERE uc.user_id = :u AND uc.status = 'owned'
     ORDER BY c.price DESC LIMIT 60`, { ':u': u.id });
  const rarities = await db.all(
    `SELECT c.rarity, count(*) AS n FROM user_cars uc JOIN cars c ON c.id = uc.car_id WHERE uc.user_id = :u AND uc.status = 'owned' GROUP BY c.rarity`, { ':u': u.id });
  const races = await db.get(`SELECT count(*) AS n, COALESCE(sum(winner_id = :u), 0) AS wins FROM races WHERE status = 'done' AND (host_id = :u OR guest_id = :u)`, { ':u': u.id });
  const bp = await db.get('SELECT xp, premium FROM bp_progress WHERE user_id = :u AND season = :s', { ':u': u.id, ':s': st.bp_season });
  const skill = await skillOf(db, u.id);
  const place = (await db.get('SELECT count(*) + 1 AS p FROM users WHERE id > 0 AND balance > :b', { ':b': u.balance })).p;
  const isFriend = !!(await db.get('SELECT 1 AS x FROM friends WHERE user_id = :v AND friend_id = :u', { ':v': viewerId, ':u': u.id }));
  const t = await now(db);
  return {
    user: { id: u.id, username: u.username, first_name: u.first_name, photo_url: u.photo_url, is_vip: u.is_vip, created_at: u.created_at, online: t - u.last_seen < 300, last_seen: u.last_seen },
    me: viewerId === u.id, is_friend: isFriend, place, balance: u.balance,
    garage: { owned: g.n, value: g.v, capacity: u.garage_capacity, rarities: Object.fromEntries(rarities.map((r) => [r.rarity, r.n])) },
    cars, skill: { purchases: skill, level: Math.floor(skill / 4), reaction: reaction(skill) },
    bp: { level: Math.min(st.bp_levels, Math.floor((bp?.xp ?? 0) / st.bp_xp_level)), premium: bp?.premium === 1 },
    stats: {
      containers_opened: u.containers_opened, wins: u.wins, bids_made: u.bids_made, cars_obtained: u.cars_obtained, cars_sold: u.cars_sold,
      earned_total: u.earned_total, spent_total: u.spent_total, referrals: u.referrals_count, races: races.n, race_wins: races.wins,
    },
  };
}
