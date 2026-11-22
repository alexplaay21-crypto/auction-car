// lib/ddl3.js — миграция 3: новые страны, динамические цены контейнеров, рынок машин,
// гонки, навык гонщика, Battle Pass, друзья. Только новые таблицы и триггеры (без ALTER),
// поэтому миграцию можно безопасно запустить повторно.
import { NOW, DAY, S, RATE, OWNED, CAPACITY, post, giveCar } from './sql.js';
import { ALL_CONTAINERS, CONTAINERS_V3, CATALOG, CATALOG_V3 } from './catalog.js';

export const SETTINGS_3 = {
  race_min_stake: 100, race_max_stake: 100_000,
  race_bot_win_bps: 9000,     // победа над ботом: +90% ставки
  race_pvp_fee_bps: 500,      // PvP: победитель забирает банк минус 5%
  bp_price: 150_000, bp_xp_level: 1000, bp_levels: 15, bp_season: 1,
  price_floor_pct: 60, price_cap_pct: 160, price_step_pct: 10, // динамика цен контейнеров
};

// Навык гонщика: 210 улучшений на 100 уровней, вся прокачка — ровно $2 000 000.
// Показатель навыка улучшается от 0,98 до 0,20 с каждым улучшением, до самого последнего
// (в заезде он прибавляется ко времени, поэтому чем меньше — тем быстрее).
// Цена n-го улучшения = 1000 + K·n⁴; последняя цена подогнана, чтобы сумма была точной.
export const SKILL_MAX = 210;
export const SKILL_LEVELS = 100;
const SKILL_BASE = 5_000, SKILL_TOTAL = 10_000_000; // ×5 с миграции 25 (экономика под заводские цены)
const K = (SKILL_TOTAL - SKILL_BASE * SKILL_MAX) / Array.from({ length: SKILL_MAX }, (_, i) => (i + 1) ** 4).reduce((a, b) => a + b, 0);
const PRICES = Array.from({ length: SKILL_MAX }, (_, i) => Math.round(SKILL_BASE + K * (i + 1) ** 4));
PRICES[SKILL_MAX - 1] += SKILL_TOTAL - PRICES.reduce((a, b) => a + b, 0);
export const skillPrice = (n) => PRICES[n - 1];
export const skillLevel = (p) => Math.floor((p * SKILL_LEVELS) / SKILL_MAX);
export const reaction = (p) => 0.20 + 0.78 * Math.max(1 - p / SKILL_MAX, 0) ** 1.6;

// Награды Battle Pass: kind money | container | car (value: 1 редкая, 2 эпическая, 3 легендарная) | skill (покупки навыка)
export function bpRewards() {
  // 15 уровней. Бесплатно: деньги, контейнеры на 4/8/12, редкая машина на 15.
  // Премиум: больше денег, навык на 3/6/9/13, контейнеры на 4/8/12/14, машины на 5/10/15 (легендарных в пассе нет — они в делюксе).
  const out = [];
  for (let l = 1; l <= SETTINGS_3.bp_levels; l++) {
    let free = ['money', 1_000 + l * 400], prem = ['money', 4_000 + l * 1_500];
    if (l % 4 === 0) free = ['container', [3, 2, 4][l / 4 - 1]];
    if (l === 14) free = ['money', 7_000];
    if (l === 15) free = ['car', 1];
    if ([3, 6, 9, 13].includes(l)) prem = ['skill', 5];
    if (l % 4 === 0) prem = ['container', [8, 7, 4][l / 4 - 1]];
    if (l === 5) prem = ['car', 1];
    if (l === 10) prem = ['car', 2];
    if (l === 14) prem = ['container', 8];
    if (l === 15) prem = ['car', 2];
    out.push([l, ...free, ...prem]);
  }
  return out;
}
const RARITY_OF = { 1: 'rare', 2: 'epic', 3: 'mythic' };

export const CUR_SEASON = `(SELECT id FROM bp_seasons WHERE starts_at <= ${NOW} AND ends_at > ${NOW} ORDER BY id DESC LIMIT 1)`;
const XP = (u, n) => `INSERT INTO bp_progress (user_id, season, xp) SELECT ${u}, ${CUR_SEASON}, ${n} WHERE ${u} IS NOT NULL AND ${CUR_SEASON} IS NOT NULL
  ON CONFLICT (user_id, season) DO UPDATE SET xp = xp + excluded.xp;`;

const q = (x) => (x == null ? 'NULL' : `'${String(x).replace(/'/g, "''")}'`);

function seed() {
  const out = Object.entries(SETTINGS_3).map(([k, v]) => `INSERT INTO settings (k, v) VALUES ('${k}', ${v}) ON CONFLICT (k) DO NOTHING`);
  CONTAINERS_V3.forEach((c, i) => {
    out.push(`INSERT INTO containers (id, name, country, emoji, price) VALUES (${i + 5}, ${q(c.name)}, ${q(c.country)}, ${q(c.emoji)}, ${c.price}) ON CONFLICT (id) DO NOTHING`);
  });
  ALL_CONTAINERS.forEach((c, i) => {
    out.push(`INSERT INTO container_meta (container_id, flag, base_price, market, prev_price, updated_at)
      VALUES (${i + 1}, ${q(c.flag)}, ${c.price}, ${Math.round((c.price * 100) / 55)}, ${c.price}, ${NOW}) ON CONFLICT (container_id) DO NOTHING`);
  });
  const first = CATALOG.length;
  CATALOG_V3.forEach((c, i) => {
    const id = first + i + 1;
    out.push(`INSERT INTO cars (id, name, country, rarity, max_speed, accel_x100, power, handling, reliability, price, color, body)
      VALUES (${id}, ${q(c.name)}, ${q(c.country)}, '${c.rarity}', ${c.speed}, ${Math.round(c.accel * 100)}, ${c.power}, ${c.handling}, ${c.reliability}, ${c.price}, ${q(c.color)}, ${q(c.body)})
      ON CONFLICT (id) DO NOTHING`);
    out.push(`INSERT INTO container_cars (container_id, car_id, weight) VALUES (${c.container}, ${id}, 1) ON CONFLICT DO NOTHING`);
  });
  // цены навыка: цена покупки и накопленная сумма
  let cum = 0;
  for (let n = 1; n <= SKILL_MAX; n++) {
    cum += skillPrice(n);
    out.push(`INSERT INTO skill_prices (n, price, cum) VALUES (${n}, ${skillPrice(n)}, ${cum}) ON CONFLICT (n) DO NOTHING`);
  }
  out.push('INSERT INTO skill_prices (n, price, cum) VALUES (0, 0, 0) ON CONFLICT (n) DO NOTHING');
  for (const [l, fk, fv, pk, pv] of bpRewards()) {
    out.push(`INSERT INTO bp_levels (season, level, free_kind, free_value, prem_kind, prem_value) VALUES (1, ${l}, '${fk}', ${fv}, '${pk}', ${pv}) ON CONFLICT DO NOTHING`);
  }
  return out;
}

const tables = [
  `CREATE TABLE IF NOT EXISTS bp_seasons (
     id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL,
     price INTEGER NOT NULL CHECK (price > 0), levels INTEGER NOT NULL CHECK (levels BETWEEN 1 AND 100),
     xp_level INTEGER NOT NULL CHECK (xp_level > 0), created_by INTEGER, created_at INTEGER NOT NULL, CHECK (ends_at > starts_at)
   )`,
  `CREATE TABLE IF NOT EXISTS bonus4 (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, amount INTEGER NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_bonus4_user ON bonus4 (user_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS user_settings (
     user_id INTEGER PRIMARY KEY, lang TEXT NOT NULL DEFAULT 'ru' CHECK (lang IN ('ru', 'en')),
     sound INTEGER NOT NULL DEFAULT 1, haptics INTEGER NOT NULL DEFAULT 1,
     n_auction INTEGER NOT NULL DEFAULT 1, n_deals INTEGER NOT NULL DEFAULT 1, n_races INTEGER NOT NULL DEFAULT 1
   )`,
  `CREATE TABLE IF NOT EXISTS container_meta (
     container_id INTEGER PRIMARY KEY, flag TEXT, base_price INTEGER NOT NULL CHECK (base_price > 0),
     market INTEGER NOT NULL, prev_price INTEGER NOT NULL, updated_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS container_prices (
     id INTEGER PRIMARY KEY AUTOINCREMENT, container_id INTEGER NOT NULL, price INTEGER NOT NULL, created_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_cprices ON container_prices (container_id, id)`,

  // рынок: игрок выставляет машину по своей цене, любой может купить
  `CREATE TABLE IF NOT EXISTS market_listings (
     id INTEGER PRIMARY KEY AUTOINCREMENT, seller_id INTEGER NOT NULL, user_car_id INTEGER NOT NULL,
     price INTEGER NOT NULL CHECK (price > 0), rate_bps INTEGER NOT NULL,
     status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'sold', 'cancelled')),
     buyer_id INTEGER, created_at INTEGER NOT NULL, resolved_at INTEGER
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_listing_open ON market_listings (user_car_id) WHERE status = 'open'`,
  `CREATE INDEX IF NOT EXISTS idx_listing_status ON market_listings (status, id)`,

  // гонки: против бота (сразу итог) или вызов другому игроку (ставка в залоге до принятия)
  `CREATE TABLE IF NOT EXISTS races (
     id INTEGER PRIMARY KEY AUTOINCREMENT, op_id TEXT NOT NULL UNIQUE,
     kind TEXT NOT NULL CHECK (kind IN ('bot', 'pvp')), track TEXT NOT NULL CHECK (track IN ('drag', 'circuit', 'rally')),
     status TEXT NOT NULL CHECK (status IN ('open', 'done', 'cancelled')),
     stake INTEGER NOT NULL CHECK (stake > 0),
     host_id INTEGER NOT NULL, host_car INTEGER NOT NULL, host_ms INTEGER,
     guest_id INTEGER, guest_car INTEGER, guest_ms INTEGER, bot_car INTEGER,
     winner_id INTEGER, created_at INTEGER NOT NULL, resolved_at INTEGER
   )`,
  `CREATE INDEX IF NOT EXISTS idx_races_open ON races (status, id)`,
  `CREATE INDEX IF NOT EXISTS idx_races_host ON races (host_id, id)`,
  `CREATE INDEX IF NOT EXISTS idx_races_guest ON races (guest_id, id)`,

  // навык гонщика
  `CREATE TABLE IF NOT EXISTS skill_prices (n INTEGER PRIMARY KEY, price INTEGER NOT NULL, cum INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS racer_skill (user_id INTEGER PRIMARY KEY, purchases INTEGER NOT NULL DEFAULT 0 CHECK (purchases BETWEEN 0 AND ${SKILL_MAX}))`,
  `CREATE TABLE IF NOT EXISTS skill_buys (
     id INTEGER PRIMARY KEY AUTOINCREMENT, op_id TEXT NOT NULL UNIQUE, user_id INTEGER NOT NULL,
     from_p INTEGER NOT NULL, count INTEGER NOT NULL CHECK (count BETWEEN 1 AND 10), price INTEGER NOT NULL, created_at INTEGER NOT NULL
   )`,
  `CREATE TRIGGER IF NOT EXISTS skill_buys_no_update BEFORE UPDATE ON skill_buys BEGIN SELECT RAISE(ABORT, 'IMMUTABLE'); END`,

  // Battle Pass
  `CREATE TABLE IF NOT EXISTS bp_levels (
     season INTEGER NOT NULL, level INTEGER NOT NULL, free_kind TEXT NOT NULL, free_value INTEGER NOT NULL,
     prem_kind TEXT NOT NULL, prem_value INTEGER NOT NULL, PRIMARY KEY (season, level)
   )`,
  `CREATE TABLE IF NOT EXISTS bp_progress (
     user_id INTEGER NOT NULL, season INTEGER NOT NULL, xp INTEGER NOT NULL DEFAULT 0, premium INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (user_id, season)
   )`,
  `CREATE TABLE IF NOT EXISTS bp_claims (
     user_id INTEGER NOT NULL, season INTEGER NOT NULL, level INTEGER NOT NULL, track TEXT NOT NULL CHECK (track IN ('free', 'premium')),
     car_id INTEGER, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, season, level, track)
   )`,
  `CREATE TABLE IF NOT EXISTS bp_purchases (user_id INTEGER NOT NULL, season INTEGER NOT NULL, price INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, season))`,

  // друзья (односторонний список «мои друзья»)
  `CREATE TABLE IF NOT EXISTS friends (user_id INTEGER NOT NULL, friend_id INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, friend_id), CHECK (user_id <> friend_id))`,
];

const BOT_WIN = `(NEW.stake * ${S('race_bot_win_bps')} / 10000)`;
const POT = `(NEW.stake * 2 * (10000 - ${S('race_pvp_fee_bps')}) / 10000)`;
const OWNS = (u, uc) => `EXISTS (SELECT 1 FROM user_cars WHERE id = ${uc} AND user_id = ${u} AND status = 'owned')`;
const BP_THRESHOLD = `(NEW.level * (SELECT xp_level FROM bp_seasons WHERE id = NEW.season))`;

const triggers = [
  // ---------- динамические цены: итог торгов двигает стартовую цену контейнера ----------
  `CREATE TRIGGER IF NOT EXISTS auctions_price AFTER UPDATE OF status ON auctions
     WHEN OLD.status = 'active' AND NEW.status IN ('won', 'no_bids') BEGIN
     UPDATE container_meta SET market = CASE WHEN NEW.status = 'won' THEN (market * 4 + NEW.current_bid) / 5 ELSE market END,
       prev_price = (SELECT price FROM containers WHERE id = NEW.container_id), updated_at = ${NOW}
       WHERE container_id = NEW.container_id;
     UPDATE containers SET price = (
       SELECT max(m.base_price * ${S('price_floor_pct')} / 100, min(m.base_price * ${S('price_cap_pct')} / 100,
              max(c.price * (100 - ${S('price_step_pct')}) / 100, min(c.price * (100 + ${S('price_step_pct')}) / 100,
                  (CASE WHEN NEW.status = 'won' THEN m.market * 55 / 100 ELSE c.price * 93 / 100 END) / 100 * 100))))
       FROM container_meta m, containers c WHERE m.container_id = NEW.container_id AND c.id = NEW.container_id)
       WHERE id = NEW.container_id AND EXISTS (SELECT 1 FROM container_meta WHERE container_id = NEW.container_id);
     INSERT INTO container_prices (container_id, price, created_at) SELECT id, price, ${NOW} FROM containers WHERE id = NEW.container_id;
   END`,

  // ---------- рынок ----------
  `CREATE TRIGGER IF NOT EXISTS listings_bi BEFORE INSERT ON market_listings BEGIN
     SELECT RAISE(ABORT, 'CAR_NOT_FOUND') WHERE NOT ${OWNS('NEW.seller_id', 'NEW.user_car_id')};
     SELECT RAISE(ABORT, 'MARKET_RARITY') WHERE (SELECT c.rarity FROM user_cars u JOIN cars c ON c.id = u.car_id WHERE u.id = NEW.user_car_id) NOT IN ('epic', 'mythic', 'mystic');
     SELECT RAISE(ABORT, 'USER_BANNED') WHERE (SELECT is_banned FROM users WHERE id = NEW.seller_id) = 1;
     SELECT RAISE(ABORT, 'BAD_LISTING') WHERE NEW.status <> 'open' OR NEW.created_at <> ${NOW} OR NEW.buyer_id IS NOT NULL
       OR NEW.rate_bps <> ${RATE('comm_player', 'NEW.seller_id')};
   END`,
  `CREATE TRIGGER IF NOT EXISTS listings_bu BEFORE UPDATE ON market_listings BEGIN
     SELECT RAISE(ABORT, 'IMMUTABLE') WHERE NEW.seller_id <> OLD.seller_id OR NEW.user_car_id <> OLD.user_car_id
       OR NEW.price <> OLD.price OR NEW.rate_bps <> OLD.rate_bps;
     SELECT RAISE(ABORT, 'LISTING_CLOSED') WHERE OLD.status <> 'open';
     SELECT RAISE(ABORT, 'SELF_BUY') WHERE NEW.status = 'sold' AND NEW.buyer_id = OLD.seller_id;
     SELECT RAISE(ABORT, 'USER_BANNED') WHERE NEW.status = 'sold' AND (SELECT is_banned FROM users WHERE id = NEW.buyer_id) = 1;
     SELECT RAISE(ABORT, 'CAR_NOT_FOUND') WHERE NEW.status = 'sold' AND NOT ${OWNS('OLD.seller_id', 'OLD.user_car_id')};
     SELECT RAISE(ABORT, 'GARAGE_FULL') WHERE NEW.status = 'sold' AND ${OWNED('NEW.buyer_id')} >= ${CAPACITY('NEW.buyer_id')};
     SELECT RAISE(ABORT, 'BAD_LISTING') WHERE NEW.resolved_at IS NOT ${NOW} OR (NEW.status = 'sold' AND NEW.buyer_id IS NULL);
   END`,
  `CREATE TRIGGER IF NOT EXISTS listings_sold AFTER UPDATE OF status ON market_listings WHEN OLD.status = 'open' AND NEW.status = 'sold' BEGIN
     ${post("'mkt:' || NEW.id", 'NEW.buyer_id', 'market_buy', '-NEW.price', 'NEW.user_car_id')}
     ${post("'mkt:' || NEW.id", 'NEW.seller_id', 'market_sell', 'NEW.price * (10000 - NEW.rate_bps) / 10000', 'NEW.user_car_id')}
     UPDATE user_cars SET user_id = NEW.buyer_id WHERE id = NEW.user_car_id;
     UPDATE users SET cars_sold = cars_sold + 1, earned_total = earned_total + NEW.price * (10000 - NEW.rate_bps) / 10000 WHERE id = NEW.seller_id;
     UPDATE users SET cars_obtained = cars_obtained + 1, spent_total = spent_total + NEW.price WHERE id = NEW.buyer_id;
     UPDATE sale_offers SET status = 'cancelled', resolved_at = ${NOW} WHERE user_car_id = NEW.user_car_id AND status = 'pending';
     ${XP('NEW.seller_id', 50)}
     ${XP('NEW.buyer_id', 50)}
   END`,
  // проданную государству или игроку машину снимаем с рынка
  `CREATE TRIGGER IF NOT EXISTS car_sales_unlist AFTER INSERT ON car_sales BEGIN
     UPDATE market_listings SET status = 'cancelled', resolved_at = ${NOW} WHERE user_car_id = NEW.user_car_id AND status = 'open';
   END`,
  `CREATE TRIGGER IF NOT EXISTS offers_unlist AFTER UPDATE OF status ON sale_offers WHEN NEW.status = 'accepted' BEGIN
     UPDATE market_listings SET status = 'cancelled', resolved_at = ${NOW} WHERE user_car_id = NEW.user_car_id AND status = 'open';
   END`,
  // смена владельца разрешена ещё и покупкой на рынке
  `DROP TRIGGER IF EXISTS user_cars_bu`,
  `CREATE TRIGGER user_cars_bu BEFORE UPDATE ON user_cars BEGIN
     SELECT RAISE(ABORT, 'IMMUTABLE') WHERE NEW.car_id <> OLD.car_id OR NEW.obtained_at <> OLD.obtained_at OR NEW.source <> OLD.source;
     SELECT RAISE(ABORT, 'CAR_SOLD') WHERE OLD.status <> 'owned';
     SELECT RAISE(ABORT, 'BAD_CAR_UPDATE') WHERE NEW.user_id <> OLD.user_id
       AND NOT EXISTS (SELECT 1 FROM sale_offers WHERE user_car_id = OLD.id AND seller_id = OLD.user_id AND buyer_id = NEW.user_id
         AND status = 'accepted' AND resolved_at = ${NOW})
       AND NOT EXISTS (SELECT 1 FROM market_listings WHERE user_car_id = OLD.id AND seller_id = OLD.user_id AND buyer_id = NEW.user_id
         AND status = 'sold' AND resolved_at = ${NOW});
   END`,

  // ---------- гонки ----------
  `CREATE TRIGGER IF NOT EXISTS races_bi BEFORE INSERT ON races BEGIN
     SELECT RAISE(ABORT, 'USER_BANNED') WHERE (SELECT is_banned FROM users WHERE id = NEW.host_id) = 1;
     SELECT RAISE(ABORT, 'CAR_NOT_FOUND') WHERE NOT ${OWNS('NEW.host_id', 'NEW.host_car')};
     SELECT RAISE(ABORT, 'BAD_STAKE') WHERE NEW.stake < ${S('race_min_stake')} OR NEW.stake > ${S('race_max_stake')};
     SELECT RAISE(ABORT, 'BAD_RACE') WHERE NEW.created_at <> ${NOW}
       OR (NEW.kind = 'bot' AND (NEW.status <> 'done' OR NEW.bot_car IS NULL OR NEW.host_ms IS NULL OR NEW.guest_ms IS NULL
           OR NEW.winner_id IS NOT (CASE WHEN NEW.host_ms < NEW.guest_ms THEN NEW.host_id END) OR NEW.resolved_at IS NOT ${NOW}))
       OR (NEW.kind = 'pvp' AND (NEW.status <> 'open' OR NEW.guest_id IS NOT NULL OR NEW.winner_id IS NOT NULL OR NEW.host_ms IS NOT NULL));
     SELECT RAISE(ABORT, 'TOO_MANY_RACES') WHERE NEW.kind = 'pvp' AND (SELECT count(*) FROM races WHERE host_id = NEW.host_id AND status = 'open') >= 3;
   END`,
  `CREATE TRIGGER IF NOT EXISTS races_ai AFTER INSERT ON races BEGIN
     -- бот: победа +90% ставки, поражение — ставка уходит; вызов: ставка в залог
     ${post("'race:' || NEW.id", 'NEW.host_id', 'race', `CASE WHEN NEW.kind = 'bot' AND NEW.winner_id = NEW.host_id THEN ${BOT_WIN} ELSE -NEW.stake END`, 'NEW.id')}
     ${XP('NEW.host_id', "CASE WHEN NEW.kind = 'bot' THEN CASE WHEN NEW.winner_id = NEW.host_id THEN 100 ELSE 60 END ELSE 0 END")}
   END`,
  `CREATE TRIGGER IF NOT EXISTS races_bu BEFORE UPDATE ON races BEGIN
     SELECT RAISE(ABORT, 'IMMUTABLE') WHERE NEW.kind <> OLD.kind OR NEW.stake <> OLD.stake OR NEW.host_id <> OLD.host_id
       OR NEW.host_car <> OLD.host_car OR NEW.track <> OLD.track;
     SELECT RAISE(ABORT, 'RACE_CLOSED') WHERE OLD.status <> 'open';
     SELECT RAISE(ABORT, 'SELF_RACE') WHERE NEW.status = 'done' AND NEW.guest_id = OLD.host_id;
     SELECT RAISE(ABORT, 'CAR_NOT_FOUND') WHERE NEW.status = 'done' AND NOT ${OWNS('NEW.guest_id', 'NEW.guest_car')};
     SELECT RAISE(ABORT, 'HOST_CAR_GONE') WHERE NEW.status = 'done' AND NOT ${OWNS('OLD.host_id', 'OLD.host_car')};
     SELECT RAISE(ABORT, 'BAD_RACE') WHERE NEW.resolved_at IS NOT ${NOW}
       OR (NEW.status = 'done' AND (NEW.host_ms IS NULL OR NEW.guest_ms IS NULL
           OR NEW.winner_id IS NOT (CASE WHEN NEW.host_ms <= NEW.guest_ms THEN OLD.host_id ELSE NEW.guest_id END)));
   END`,
  `CREATE TRIGGER IF NOT EXISTS races_done AFTER UPDATE OF status ON races WHEN OLD.status = 'open' BEGIN
     ${post("'race:' || NEW.id", 'NEW.guest_id', 'race', `CASE WHEN NEW.status = 'done' THEN -NEW.stake ELSE 0 END`, 'NEW.id')}
     ${post("'racewin:' || NEW.id", 'NEW.winner_id', 'race_win', `CASE WHEN NEW.status = 'done' THEN ${POT} ELSE 0 END`, 'NEW.id')}
     ${post("'racecancel:' || NEW.id", 'NEW.host_id', 'race_refund', `CASE WHEN NEW.status = 'cancelled' THEN NEW.stake ELSE 0 END`, 'NEW.id')}
     ${XP('NEW.host_id', "CASE WHEN NEW.status = 'done' THEN CASE WHEN NEW.winner_id = NEW.host_id THEN 100 ELSE 60 END ELSE 0 END")}
     ${XP('NEW.guest_id', "CASE WHEN NEW.status = 'done' THEN CASE WHEN NEW.winner_id = NEW.guest_id THEN 100 ELSE 60 END ELSE 0 END")}
   END`,

  // ---------- навык гонщика: покупка 1–10 уровней по таблице цен ----------
  `CREATE TRIGGER IF NOT EXISTS skill_buys_bi BEFORE INSERT ON skill_buys BEGIN
     SELECT RAISE(ABORT, 'SKILL_CHANGED') WHERE NEW.from_p <> COALESCE((SELECT purchases FROM racer_skill WHERE user_id = NEW.user_id), 0);
     SELECT RAISE(ABORT, 'SKILL_MAX') WHERE NEW.from_p + NEW.count > ${SKILL_MAX};
     SELECT RAISE(ABORT, 'BAD_PRICE') WHERE NEW.created_at <> ${NOW} OR NEW.price <>
       (SELECT cum FROM skill_prices WHERE n = NEW.from_p + NEW.count) - (SELECT cum FROM skill_prices WHERE n = NEW.from_p);
   END`,
  `CREATE TRIGGER IF NOT EXISTS skill_buys_ai AFTER INSERT ON skill_buys BEGIN
     ${post("'skill:' || NEW.id", 'NEW.user_id', 'skill', '-NEW.price', 'NEW.from_p + NEW.count')}
     INSERT INTO racer_skill (user_id, purchases) VALUES (NEW.user_id, NEW.count)
       ON CONFLICT (user_id) DO UPDATE SET purchases = purchases + excluded.purchases;
   END`,

  // ---------- Battle Pass: опыт за действия ----------
  `CREATE TRIGGER IF NOT EXISTS bids_xp AFTER INSERT ON bids BEGIN ${XP('NEW.user_id', 10)} END`,
  `CREATE TRIGGER IF NOT EXISTS auctions_xp AFTER UPDATE OF status ON auctions WHEN OLD.status = 'active' AND NEW.status = 'won' BEGIN ${XP('NEW.leader_id', 150)} END`,
  `CREATE TRIGGER IF NOT EXISTS opens_xp AFTER INSERT ON container_opens BEGIN ${XP('NEW.user_id', 150)} END`,
  `CREATE TRIGGER IF NOT EXISTS bonus4_bi BEFORE INSERT ON bonus4 BEGIN
     SELECT RAISE(ABORT, 'BONUS_TOO_EARLY') WHERE ${NOW} - COALESCE((SELECT max(created_at) FROM bonus4 WHERE user_id = NEW.user_id), 0) < ${S('bonus_period_s')};
     SELECT RAISE(ABORT, 'BONUS_RICH') WHERE (SELECT balance FROM users WHERE id = NEW.user_id)
       >= CASE WHEN (SELECT is_vip FROM users WHERE id = NEW.user_id) = 1 THEN ${S('bonus_cap_vip')} ELSE ${S('bonus_cap')} END;
     SELECT RAISE(ABORT, 'BAD_BONUS') WHERE NEW.created_at <> ${NOW} OR NEW.amount <> CASE WHEN (SELECT is_vip FROM users WHERE id = NEW.user_id) = 1
       THEN ${S('daily_bonus_vip')} ELSE ${S('daily_bonus')} END;
   END`,
  `CREATE TRIGGER IF NOT EXISTS bonus4_ai AFTER INSERT ON bonus4 BEGIN
     ${post("'bonus4:' || NEW.id", 'NEW.user_id', 'daily_bonus', 'NEW.amount')}
     ${XP('NEW.user_id', 100)}
   END`,
  `CREATE TRIGGER IF NOT EXISTS bp_buy_bi BEFORE INSERT ON bp_purchases BEGIN
     SELECT RAISE(ABORT, 'BP_NO_SEASON') WHERE NEW.season IS NOT ${CUR_SEASON};
     SELECT RAISE(ABORT, 'BAD_BP') WHERE NEW.price <> (SELECT price FROM bp_seasons WHERE id = NEW.season) OR NEW.created_at <> ${NOW};
   END`,
  `CREATE TRIGGER IF NOT EXISTS bp_buy_ai AFTER INSERT ON bp_purchases BEGIN
     ${post("'bp:' || NEW.season", 'NEW.user_id', 'bp', '-NEW.price')}
     INSERT INTO bp_progress (user_id, season, xp, premium) VALUES (NEW.user_id, NEW.season, 0, 1)
       ON CONFLICT (user_id, season) DO UPDATE SET premium = 1;
     UPDATE users SET first_purchase_done = 1 WHERE id = NEW.user_id;
   END`,
  // награда уровня: деньги, контейнер, навык или машина нужной редкости (машину выбирает код)
  `CREATE TRIGGER IF NOT EXISTS bp_claim_bi BEFORE INSERT ON bp_claims BEGIN
     SELECT RAISE(ABORT, 'BP_LOCKED') WHERE COALESCE((SELECT xp FROM bp_progress WHERE user_id = NEW.user_id AND season = NEW.season), 0) < ${BP_THRESHOLD};
     SELECT RAISE(ABORT, 'BP_NOT_PREMIUM') WHERE NEW.track = 'premium'
       AND COALESCE((SELECT premium FROM bp_progress WHERE user_id = NEW.user_id AND season = NEW.season), 0) = 0;
     SELECT RAISE(ABORT, 'BAD_CLAIM') WHERE NEW.season IS NOT ${CUR_SEASON} OR NEW.created_at <> ${NOW}
       OR NOT EXISTS (SELECT 1 FROM bp_levels WHERE season = NEW.season AND level = NEW.level)
       OR (NEW.car_id IS NULL) <> ((SELECT CASE NEW.track WHEN 'free' THEN free_kind ELSE prem_kind END FROM bp_levels WHERE season = NEW.season AND level = NEW.level) <> 'car')
       OR (NEW.car_id IS NOT NULL AND (SELECT rarity FROM cars WHERE id = NEW.car_id) IS NOT
           (SELECT CASE CASE NEW.track WHEN 'free' THEN free_value ELSE prem_value END WHEN 1 THEN 'rare' WHEN 2 THEN 'epic' ELSE 'mythic' END
            FROM bp_levels WHERE season = NEW.season AND level = NEW.level));
   END`,
  `CREATE TRIGGER IF NOT EXISTS bp_claim_ai AFTER INSERT ON bp_claims BEGIN
     ${post("'bpc:' || NEW.season || ':' || NEW.level || ':' || NEW.track", 'NEW.user_id', 'bp_reward',
       `COALESCE((SELECT CASE NEW.track WHEN 'free' THEN CASE free_kind WHEN 'money' THEN free_value ELSE 0 END ELSE CASE prem_kind WHEN 'money' THEN prem_value ELSE 0 END END
         FROM bp_levels WHERE season = NEW.season AND level = NEW.level), 0)`)}
     INSERT INTO user_containers (user_id, container_id, qty)
       SELECT NEW.user_id, CASE NEW.track WHEN 'free' THEN free_value ELSE prem_value END, 1 FROM bp_levels
       WHERE season = NEW.season AND level = NEW.level AND (CASE NEW.track WHEN 'free' THEN free_kind ELSE prem_kind END) = 'container'
       ON CONFLICT (user_id, container_id) DO UPDATE SET qty = qty + 1;
     INSERT INTO racer_skill (user_id, purchases)
       SELECT NEW.user_id, min(${SKILL_MAX}, CASE NEW.track WHEN 'free' THEN free_value ELSE prem_value END) FROM bp_levels
       WHERE season = NEW.season AND level = NEW.level AND (CASE NEW.track WHEN 'free' THEN free_kind ELSE prem_kind END) = 'skill'
       ON CONFLICT (user_id) DO UPDATE SET purchases = min(${SKILL_MAX}, purchases + excluded.purchases);
     INSERT INTO car_grants (op_id, user_id, car_id, source, created_at)
       SELECT 'bpc:' || NEW.season || ':' || NEW.level || ':' || NEW.track || ':' || NEW.user_id, NEW.user_id, NEW.car_id, 'bp', ${NOW} WHERE NEW.car_id IS NOT NULL;
   END`,
  `CREATE TRIGGER IF NOT EXISTS bp_claims_no_update BEFORE UPDATE ON bp_claims BEGIN SELECT RAISE(ABORT, 'IMMUTABLE'); END`,

  // ---------- друзья ----------
  `CREATE TRIGGER IF NOT EXISTS friends_bi BEFORE INSERT ON friends BEGIN
     SELECT RAISE(ABORT, 'USER_NOT_FOUND') WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.friend_id AND id > 0);
     SELECT RAISE(ABORT, 'TOO_MANY_FRIENDS') WHERE (SELECT count(*) FROM friends WHERE user_id = NEW.user_id) >= 200;
   END`,
];

export const MIGRATION_3 = [...tables, ...triggers, ...seed()];

// Миграция 4: навык — 210 улучшений за $2 000 000, Battle Pass — 14 уровней.
const find3 = (prefix) => { const x = triggers.find((t) => t.startsWith(prefix)); if (!x) throw new Error('ddl3: ' + prefix); return x; };
export const MIGRATION_4 = [
  `UPDATE settings SET v = ${SETTINGS_3.bp_levels} WHERE k = 'bp_levels'`,
  'DELETE FROM skill_prices',
  ...seed().filter((x) => x.startsWith('INSERT INTO skill_prices')),
  `UPDATE racer_skill SET purchases = min(purchases, ${SKILL_MAX})`,
  'DROP TRIGGER IF EXISTS skill_buys_bi', find3('CREATE TRIGGER IF NOT EXISTS skill_buys_bi'),
  'DROP TRIGGER IF EXISTS bp_claim_ai', find3('CREATE TRIGGER IF NOT EXISTS bp_claim_ai'),
  'DELETE FROM bp_levels WHERE season = 1',
  ...seed().filter((x) => x.startsWith('INSERT INTO bp_levels')),
];
void DAY; void giveCar; void RARITY_OF;

// Миграция 5: бонус раз в 4 часа ($5 000 / VIP $10 000, не выдаётся при балансе от $50 000 / $100 000),
// редкие эпические и легендарные машины, рынок только для них, сезоны Battle Pass по 21 дню,
// настройки игрока. Триггеры с опытом и сезоном пересоздаются по новым определениям.
const RECREATE = ['listings_bi', 'listings_sold', 'races_ai', 'races_done', 'bids_xp', 'auctions_xp', 'opens_xp', 'bp_buy_bi', 'bp_claim_bi', 'bonus4_bi', 'bonus4_ai'];
export const findT = (name) => { const x = triggers.find((t) => t.startsWith(`CREATE TRIGGER IF NOT EXISTS ${name} `)); if (!x) throw new Error('ddl3: ' + name); return x; };
export const MIGRATION_5 = [
  ...tables.slice(0, 4),
  ...Object.entries({ daily_bonus: 5_000, daily_bonus_vip: 10_000, bonus_period_s: 14_400, bonus_cap: 50_000, bonus_cap_vip: 100_000,
    chance_common: 740, chance_rare: 215, chance_epic: 40, chance_mythic: 5 })
    .map(([k, v]) => `INSERT INTO settings (k, v) VALUES ('${k}', ${v}) ON CONFLICT (k) DO UPDATE SET v = excluded.v`),
  'UPDATE containers SET chance_common = NULL, chance_rare = NULL, chance_epic = NULL, chance_mythic = NULL',
  'DROP TRIGGER IF EXISTS bonus_xp',
  ...RECREATE.flatMap((n) => [`DROP TRIGGER IF EXISTS ${n}`, findT(n)]),
  `INSERT INTO bp_seasons (id, name, starts_at, ends_at, price, levels, xp_level, created_at)
     VALUES (1, 'Сезон 1', ${NOW}, ${NOW} + 21 * 86400, ${SETTINGS_3.bp_price}, ${SETTINGS_3.bp_levels}, ${SETTINGS_3.bp_xp_level}, ${NOW}) ON CONFLICT (id) DO NOTHING`,
];
