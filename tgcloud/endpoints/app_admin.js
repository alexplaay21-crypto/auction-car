// Админ-панель Mini App: настройки, каталог машин и контейнеров с фото, игроки,
// промокоды, лоты магазина, управление аукционами. Все действия пишутся в admin_log.
import { endpoint } from '../lib/endpoint.js';
import { settings, dropSettingsCache, adminAdjust, adminLog, findUser, getUser, GameError, now } from '../lib/engine.js';
import { SETTINGS } from '../lib/ddl.js';
import { SETTINGS_3 } from '../lib/ddl3.js';
import { currentSeason, createSeason, setLevelReward, setSeasonCar } from '../lib/engine3.js';
import { ADMIN_IDS } from '../lib/config.js';
import { feedbackList, answerFeedback } from '../lib/stars.js';

const RARITIES = ['common', 'rare', 'epic', 'mythic'];
const int = (v, min = 0, max = 1e12) => {
  const n = Math.floor(Number(v));
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new GameError('BAD_INPUT');
  return n;
};
const str = (v, max = 64) => {
  const s = String(v ?? '').trim();
  if (!s || s.length > max) throw new GameError('BAD_INPUT');
  return s;
};
const opt = (v, f) => (v === null || v === undefined || v === '' ? null : f(v));

export default endpoint(async (db, uid, input, { user }) => {
  const a = String(input.action ?? 'stats');
  const log = (details) => adminLog(db, uid, a, details);

  // ---------- сообщения игроков ----------
  if (a === 'feedback') return { list: await feedbackList(db, input.status), open: (await db.get("SELECT count(*) AS n FROM feedback WHERE status = 'new'")).n };
  if (a === 'feedback_answer') {
    await answerFeedback(db, uid, input.id, input.answer);
    await log({ id: input.id, answered: !!input.answer });
    return { ok: true };
  }
  // покупки за звёзды и товары
  if (a === 'stars') {
    return {
      products: await db.all('SELECT * FROM star_products ORDER BY sort, id'),
      recent: await db.all('SELECT p.*, u.username, u.first_name FROM star_payments p LEFT JOIN users u ON u.id = p.user_id ORDER BY p.created_at DESC LIMIT 30'),
      total: await db.get('SELECT count(*) AS n, COALESCE(sum(stars), 0) AS stars FROM star_payments'),
    };
  }
  if (a === 'save_star_product') {
    const p = input.product ?? {};
    const stars = Math.floor(Number(p.stars)), m = Math.floor(Number(p.money ?? 0));
    if (!Number.isSafeInteger(stars) || stars < 1 || stars > 100000 || !Number.isSafeInteger(m) || m < 0) throw new GameError('BAD_INPUT');
    await db.run('UPDATE star_products SET stars = :s, money = :m, is_active = :a WHERE id = :i', { ':s': stars, ':m': m, ':a': p.is_active ? 1 : 0, ':i': String(p.id) });
    await log({ id: p.id, stars, money: m, active: !!p.is_active });
    return { ok: true };
  }

  if (a === 'stats') {
    const t = await now(db);
    return {
      users: (await db.get('SELECT count(*) AS n FROM users WHERE id > 0')).n,
      active_day: (await db.get('SELECT count(*) AS n FROM users WHERE id > 0 AND last_seen > :t', { ':t': t - 86400 })).n,
      money: (await db.get('SELECT COALESCE(sum(balance), 0) AS n FROM users WHERE id > 0')).n,
      cars_owned: (await db.get(`SELECT count(*) AS n FROM user_cars WHERE status = 'owned'`)).n,
      rooms_open: (await db.get(`SELECT count(*) AS n FROM rooms WHERE status = 'open'`)).n,
      auctions_day: (await db.get('SELECT count(*) AS n FROM auctions WHERE started_at > :t', { ':t': t - 86400 })).n,
      won_day: (await db.get(`SELECT count(*) AS n, COALESCE(sum(current_bid), 0) AS sum FROM auctions WHERE status = 'won' AND ended_at > :t`, { ':t': t - 86400 })),
      log: await db.all('SELECT l.*, u.username FROM admin_log l LEFT JOIN users u ON u.id = l.admin_id ORDER BY l.id DESC LIMIT 30'),
    };
  }

  // ---------- настройки ----------
  if (a === 'settings') return { values: await settings(db, { fresh: true }), keys: [...Object.keys(SETTINGS), ...Object.keys(SETTINGS_3).filter((k) => !k.startsWith('bp_')), 'bonus_period_s', 'bonus_cap', 'bonus_cap_vip'] };
  if (a === 'set') {
    const k = String(input.k);
    if (!(k in SETTINGS) && !(k in SETTINGS_3) && !['bonus_period_s', 'bonus_cap', 'bonus_cap_vip'].includes(k)) throw new GameError('BAD_SETTING');
    const v = int(input.v, 0, 1e12);
    if (/^chance_/.test(k) && v > 100000) throw new GameError('BAD_INPUT');
    if (/_bps$/.test(k) && v > 10000) throw new GameError('BAD_INPUT');
    if (['auction_timer_s', 'max_players', 'bet_step', 'garage_start', 'kick_after'].includes(k) && v < 1) throw new GameError('BAD_INPUT');
    await db.run('INSERT INTO settings (k, v) VALUES (:k, :v) ON CONFLICT (k) DO UPDATE SET v = excluded.v', { ':k': k, ':v': v });
    dropSettingsCache();
    await log({ k, v });
    return { ok: true };
  }

  // ---------- каталог ----------
  if (a === 'catalog') {
    return {
      cars: await db.all('SELECT * FROM cars ORDER BY rarity, price'),
      containers: await db.all('SELECT c.*, m.flag, m.base_price FROM containers c LEFT JOIN container_meta m ON m.container_id = c.id ORDER BY c.id'),
      pools: await db.all('SELECT * FROM container_cars'),
      images: await db.all('SELECT kind, ref_id, v FROM images'),
    };
  }
  if (a === 'save_car') {
    const c = input.car ?? {};
    const f = {
      ':name': str(c.name), ':country': opt(c.country, (x) => str(x, 40)), ':rarity': RARITIES.includes(c.rarity) ? c.rarity : null,
      ':speed': int(c.max_speed, 1, 600), ':accel': int(c.accel_x100, 50, 5000), ':power': int(c.power, 1, 3000),
      ':handling': int(c.handling, 0, 100), ':rel': int(c.reliability, 0, 100), ':price': int(c.price, 1),
      ':color': opt(c.color, (x) => (/^#[0-9a-f]{6}$/i.test(x) ? x : null)), ':body': ['sedan', 'hatch', 'coupe', 'super', 'wagon', 'suv'].includes(c.body) ? c.body : 'sedan',
      ':active': c.is_active === 0 ? 0 : 1,
    };
    if (!f[':rarity']) throw new GameError('BAD_INPUT');
    let id = c.id ? int(c.id, 1) : null;
    if (id) {
      await db.run(`UPDATE cars SET name = :name, country = :country, rarity = :rarity, max_speed = :speed, accel_x100 = :accel, power = :power,
        handling = :handling, reliability = :rel, price = :price, color = :color, body = :body, is_active = :active WHERE id = :id`, { ...f, ':id': id });
    } else {
      id = (await db.run(`INSERT INTO cars (name, country, rarity, max_speed, accel_x100, power, handling, reliability, price, color, body, is_active)
        VALUES (:name, :country, :rarity, :speed, :accel, :power, :handling, :rel, :price, :color, :body, :active)`, f)).lastInsertRowid;
    }
    await log({ id, name: f[':name'] });
    return { id };
  }
  if (a === 'save_container') {
    const c = input.container ?? {};
    const ch = (r) => opt(c['chance_' + r], (x) => int(x, 0, 100000));
    const f = {
      ':name': str(c.name), ':country': opt(c.country, (x) => str(x, 40)), ':emoji': opt(c.emoji, (x) => str(x, 8)), ':price': int(c.price, 1),
      ':en': c.is_enabled === 0 ? 0 : 1, ':cc': ch('common'), ':cr': ch('rare'), ':ce': ch('epic'), ':cm': ch('mythic'),
    };
    let id = c.id ? int(c.id, 1) : null;
    if (id) {
      await db.run(`UPDATE containers SET name = :name, country = :country, emoji = :emoji, price = :price, is_enabled = :en,
        chance_common = :cc, chance_rare = :cr, chance_epic = :ce, chance_mythic = :cm WHERE id = :id`, { ...f, ':id': id });
    } else {
      id = (await db.run(`INSERT INTO containers (name, country, emoji, price, is_enabled, chance_common, chance_rare, chance_epic, chance_mythic)
        VALUES (:name, :country, :emoji, :price, :en, :cc, :cr, :ce, :cm)`, f)).lastInsertRowid;
    }
    // цена из админки становится базовой для динамики
    const flag = ['us', 'ru', 'jp', 'cn', 'de', 'fr', 'it', 'world'].includes(c.flag) ? c.flag : null;
    await db.run(`INSERT INTO container_meta (container_id, flag, base_price, market, prev_price, updated_at) VALUES (:c, :f, :p, :m, :p, (SELECT now FROM v_now))
      ON CONFLICT (container_id) DO UPDATE SET flag = COALESCE(excluded.flag, flag), base_price = excluded.base_price, market = excluded.market, prev_price = excluded.prev_price`,
      { ':c': id, ':f': flag, ':p': f[':price'], ':m': Math.round((f[':price'] * 100) / 55) });
    if (Array.isArray(input.pool)) {
      await db.run('DELETE FROM container_cars WHERE container_id = :c', { ':c': id });
      for (const p of input.pool.slice(0, 200)) {
        await db.run('INSERT INTO container_cars (container_id, car_id, weight) VALUES (:c, :car, :w) ON CONFLICT DO UPDATE SET weight = excluded.weight',
          { ':c': id, ':car': int(p.car_id, 1), ':w': int(p.weight ?? 1, 0, 1_000_000) });
      }
    }
    await log({ id, name: f[':name'] });
    return { id };
  }
  if (a === 'image') {
    const kind = ['car', 'container', 'lot'].includes(input.kind) ? input.kind : null;
    const id = int(input.id, 1);
    const mime = ['image/jpeg', 'image/png', 'image/webp'].includes(input.mime) ? input.mime : null;
    const data = String(input.data ?? '').replace(/^data:[^,]*,/, '');
    if (!kind || !mime || !/^[A-Za-z0-9+/=]+$/.test(data) || data.length > 400_000) throw new GameError('IMAGE_TOO_BIG');
    await db.run(`INSERT INTO images (kind, ref_id, mime, data, v, updated_at) VALUES (:k, :i, :m, :d, 1, (SELECT now FROM v_now))
      ON CONFLICT (kind, ref_id) DO UPDATE SET mime = excluded.mime, data = excluded.data, v = images.v + 1, file_id = NULL, updated_at = excluded.updated_at`,
      { ':k': kind, ':i': id, ':m': mime, ':d': data });
    await log({ kind, id, size: data.length });
    return { ok: true };
  }
  if (a === 'delete_image') {
    await db.run('DELETE FROM images WHERE kind = :k AND ref_id = :i', { ':k': String(input.kind), ':i': int(input.id, 1) });
    return { ok: true };
  }

  // ---------- игроки ----------
  if (a === 'users') {
    const q = String(input.q ?? '').trim();
    const list = q
      ? await db.all(`SELECT * FROM users WHERE id > 0 AND (CAST(id AS TEXT) = :q OR lower(username) LIKE lower(:l) OR lower(first_name) LIKE lower(:l)) ORDER BY last_seen DESC LIMIT 30`,
        { ':q': q.replace(/^@/, ''), ':l': '%' + q.replace(/^@/, '') + '%' })
      : await db.all('SELECT * FROM users WHERE id > 0 ORDER BY last_seen DESC LIMIT 30');
    return { list };
  }
  if (a === 'user') {
    const u = await getUser(db, int(input.id, 1));
    if (!u) throw new GameError('USER_NOT_FOUND');
    const cars = await db.all(`SELECT uc.id, c.name, c.rarity, c.price FROM user_cars uc JOIN cars c ON c.id = uc.car_id WHERE uc.user_id = :u AND uc.status = 'owned' ORDER BY c.price DESC LIMIT 60`, { ':u': u.id });
    const ledger = await db.all('SELECT kind, delta, balance_after, created_at FROM ledger WHERE user_id = :u ORDER BY id DESC LIMIT 30', { ':u': u.id });
    return { user: u, cars, ledger };
  }
  if (a === 'adjust') {
    await adminAdjust(db, uid, int(input.id, 1), int(input.delta, -1e12, 1e12), String(input.reason ?? '').slice(0, 200), String(input.clientId ?? Date.now()));
    return { ok: true };
  }
  if (a === 'ban') {
    const id = int(input.id, 1);
    if (ADMIN_IDS.includes(id)) throw new GameError('CANNOT_TARGET_OWNER');
    await db.run('UPDATE users SET is_banned = :b, ban_reason = :r WHERE id = :id', { ':b': input.ban ? 1 : 0, ':r': input.ban ? String(input.reason ?? '').slice(0, 200) : null, ':id': id });
    await db.run('UPDATE room_members SET left_at = (SELECT now FROM v_now) WHERE user_id = :id AND left_at IS NULL', { ':id': id });
    await log({ id, ban: !!input.ban });
    return { ok: true };
  }
  if (a === 'vip') {
    const id = int(input.id, 1);
    if (input.grant) await db.run(`INSERT INTO vip_grants (user_id, source, price, granted_by, created_at) VALUES (:u, 'admin', 0, :a, (SELECT now FROM v_now))`, { ':u': id, ':a': uid });
    else await db.run('DELETE FROM vip_grants WHERE user_id = :u', { ':u': id });
    await log({ id, grant: !!input.grant });
    return { ok: true };
  }
  if (a === 'give_car') {
    const target = int(input.id, 1);
    await db.run(`INSERT INTO car_grants (op_id, user_id, car_id, source, created_at) VALUES (:op, :u, :c, 'admin', (SELECT now FROM v_now))`,
      { ':op': `admin:${uid}:${String(input.clientId ?? Date.now())}`, ':u': target, ':c': int(input.car_id, 1) });
    await log({ id: target, car: input.car_id });
    return { ok: true };
  }
  if (a === 'give_container') {
    const target = int(input.id, 1), qty = int(input.qty ?? 1, 1, 1000);
    await db.run(`INSERT INTO user_containers (user_id, container_id, qty) VALUES (:u, :c, :q) ON CONFLICT DO UPDATE SET qty = qty + excluded.qty`,
      { ':u': target, ':c': int(input.container_id, 1), ':q': qty });
    await log({ id: target, container: input.container_id, qty });
    return { ok: true };
  }
  if (a === 'set_admin') {
    if (!ADMIN_IDS.includes(uid)) throw new GameError('OWNER_ONLY');
    const target = await findUser(db, input.to);
    if (!target) throw new GameError('USER_NOT_FOUND');
    await db.run('UPDATE users SET is_admin = :a WHERE id = :id', { ':a': input.admin ? 1 : 0, ':id': target.id });
    await log({ id: target.id, admin: !!input.admin });
    return { ok: true };
  }

  // ---------- промокоды ----------
  if (a === 'promos') return { list: await db.all('SELECT * FROM promo_codes ORDER BY created_at DESC LIMIT 100') };
  if (a === 'save_promo') {
    const p = input.promo ?? {};
    const code = str(p.code, 32).toUpperCase();
    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) throw new GameError('BAD_CODE');
    await db.run(`INSERT INTO promo_codes (code, money, container_id, container_qty, vip, car_id, max_uses, expires_at, is_active, created_by, created_at)
      VALUES (:c, :m, :ci, :cq, :v, :car, :mu, :e, 1, :a, (SELECT now FROM v_now))
      ON CONFLICT (code) DO UPDATE SET money = excluded.money, container_id = excluded.container_id, container_qty = excluded.container_qty,
        vip = excluded.vip, car_id = excluded.car_id, max_uses = excluded.max_uses, expires_at = excluded.expires_at, is_active = 1`,
      { ':c': code, ':m': int(p.money ?? 0), ':ci': opt(p.container_id, (x) => int(x, 1)), ':cq': int(p.container_qty ?? 0, 0, 1000),
        ':v': p.vip ? 1 : 0, ':car': opt(p.car_id, (x) => int(x, 1)), ':mu': opt(p.max_uses, (x) => int(x, 1)),
        ':e': opt(p.days, (x) => int(x, 1, 3650) * 86400 + Math.floor(Date.now() / 1000)), ':a': uid });
    await log({ code });
    return { ok: true };
  }
  if (a === 'toggle_promo') {
    await db.run('UPDATE promo_codes SET is_active = :a WHERE code = :c', { ':a': input.active ? 1 : 0, ':c': String(input.code) });
    return { ok: true };
  }

  // ---------- магазин ----------
  if (a === 'lots') return { list: await db.all('SELECT * FROM shop_lots ORDER BY sort, id') };
  if (a === 'save_lot') {
    const l = input.lot ?? {};
    const f = {
      ':t': str(l.title, 80), ':d': opt(l.description, (x) => String(x).slice(0, 300)), ':p': int(l.price, 1), ':m': int(l.money ?? 0),
      ':ci': opt(l.container_id, (x) => int(x, 1)), ':cq': int(l.container_qty ?? 0, 0, 1000), ':car': opt(l.car_id, (x) => int(x, 1)),
      ':v': l.vip ? 1 : 0, ':av': l.is_available === 0 ? 0 : 1, ':s': int(l.sort ?? 0, 0, 1000), ':lim': opt(l.per_user_limit, (x) => int(x, 1)),
    };
    let id = l.id ? int(l.id, 1) : null;
    if (id) await db.run(`UPDATE shop_lots SET title = :t, description = :d, price = :p, money = :m, container_id = :ci, container_qty = :cq, car_id = :car,
      vip = :v, is_available = :av, sort = :s, per_user_limit = :lim WHERE id = :id`, { ...f, ':id': id });
    else id = (await db.run(`INSERT INTO shop_lots (title, description, price, money, container_id, container_qty, car_id, vip, is_available, sort, per_user_limit)
      VALUES (:t, :d, :p, :m, :ci, :cq, :car, :v, :av, :s, :lim)`, f)).lastInsertRowid;
    await log({ id, title: f[':t'] });
    return { id };
  }

  // ---------- Battle Pass ----------
  if (a === 'bp_seasons') {
    const seasons = await db.all('SELECT * FROM bp_seasons ORDER BY id DESC LIMIT 20');
    const cur = await currentSeason(db);
    const levels = cur ? await db.all('SELECT * FROM bp_levels WHERE season = :s ORDER BY level', { ':s': cur.id }) : [];
    return { seasons, current: cur, levels, now: await now(db), containers: await db.all('SELECT id, name FROM containers ORDER BY id'), cars: await db.all('SELECT id, name, rarity FROM cars WHERE is_active = 1 ORDER BY price DESC') };
  }
  if (a === 'bp_create') {
    const id = await createSeason(db, uid, { name: input.name, days: input.days ?? 21, price: input.price, levels: input.levels, xpLevel: input.xp_level, carId: input.car_id });
    await log({ id, name: input.name });
    return { id };
  }
  if (a === 'bp_car') {
    await setSeasonCar(db, input.season, input.car_id, input.track);
    await log({ season: input.season, car: input.car_id });
    return { ok: true };
  }
  if (a === 'bp_reward') {
    await setLevelReward(db, input);
    await log({ season: input.season, level: input.level, track: input.track, kind: input.kind, value: input.value });
    return { ok: true };
  }
  if (a === 'bp_end') {
    await db.run('UPDATE bp_seasons SET ends_at = (SELECT now FROM v_now) WHERE id = :s AND ends_at > (SELECT now FROM v_now)', { ':s': int(input.season, 1) });
    await log({ season: input.season });
    return { ok: true };
  }

  // ---------- аукционы ----------
  if (a === 'rooms') {
    return { list: await db.all(`SELECT r.*, (SELECT count(*) FROM room_members WHERE room_id = r.id AND left_at IS NULL) AS players,
      (SELECT current_bid FROM auctions WHERE room_id = r.id AND status = 'active') AS bid FROM rooms r WHERE r.status = 'open' ORDER BY r.id DESC LIMIT 50`) };
  }
  if (a === 'cancel_auction') {
    const r = await db.run(`UPDATE auctions SET status = 'cancelled', ended_at = (SELECT now FROM v_now) WHERE room_id = :r AND status = 'active'`, { ':r': int(input.roomId, 1) });
    await log({ room: input.roomId });
    return { ok: r.rowsAffected > 0, __room: int(input.roomId, 1) };
  }
  if (a === 'stop_room') {
    await db.run('UPDATE rooms SET stop_requested = 1, rev = rev + 1 WHERE id = :r', { ':r': int(input.roomId, 1) });
    await log({ room: input.roomId });
    return { ok: true, __room: int(input.roomId, 1) };
  }
  void user;
  throw new GameError('BAD_INPUT');
}, { admin: true });
