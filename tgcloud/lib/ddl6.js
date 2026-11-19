// ddl6.js — миграция 7: покупки за Telegram Stars (премиум Battle Pass, VIP, пакеты валюты),
// сообщения о проблемах и идеях, кик после двух пропущенных контейнеров.
import { NOW, post } from './sql.js';

// Пакеты валюты: маленький нарочно невыгодный, каждый следующий заметно выгоднее —
// курс растёт с $1 000 до $2 400 за звезду (+140 %). «Популярный» стоит посередине.
export const STAR_PRODUCTS = [
  // id, kind, stars, money, badge
  ['m50', 'money', 50, 50_000, null],
  ['m100', 'money', 100, 120_000, null],
  ['m250', 'money', 250, 350_000, 'popular'],
  ['m500', 'money', 500, 800_000, null],
  ['m1000', 'money', 1000, 2_000_000, 'best'],
  ['m2500', 'money', 2500, 6_000_000, 'max'],
  ['vip', 'vip', 149, 0, null],
  ['bp', 'bp', 99, 0, null],
  ['bpdx', 'bpdx', 49, 0, null], // делюкс: только после премиума, +5 уровней
  ['bplvl', 'bplvl', 5, 0, null], // один уровень Battle Pass
];
export const DELUXE_LEVELS = 5;

const tables = [
  `CREATE TABLE IF NOT EXISTS star_products (
     id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('money', 'vip', 'bp')),
     stars INTEGER NOT NULL CHECK (stars > 0), money INTEGER NOT NULL DEFAULT 0 CHECK (money >= 0),
     badge TEXT, sort INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1
   )`,
  // Оплата пришла от Telegram — отказать уже нельзя, поэтому триггер ничего не проверяет,
  // а только выдаёт товар. Повтор одного платежа отсекает PRIMARY KEY.
  `CREATE TABLE IF NOT EXISTS star_payments (
     charge_id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, product TEXT NOT NULL, kind TEXT NOT NULL,
     stars INTEGER NOT NULL, money INTEGER NOT NULL DEFAULT 0, season INTEGER, created_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_star_payments_user ON star_payments (user_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS feedback (
     id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('bug', 'idea')),
     text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'done')),
     answer TEXT, answered_by INTEGER, created_at INTEGER NOT NULL, answered_at INTEGER
   )`,
  `CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback (status, id)`,
  `CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback (user_id, created_at)`,
];

const triggers = [
  `CREATE TRIGGER IF NOT EXISTS star_pay_ai AFTER INSERT ON star_payments BEGIN
     ${post("'star:' || NEW.charge_id", 'NEW.user_id', 'stars', 'NEW.money')}
     -- что выдать, решает код (lib/stars.js): если товар уже есть, вместо него приходят деньги
     INSERT INTO vip_grants (user_id, source, price, created_at)
       SELECT NEW.user_id, 'shop', 0, ${NOW} WHERE NEW.kind = 'vip';
     INSERT INTO bp_progress (user_id, season, xp, premium) SELECT NEW.user_id, NEW.season, 0, 1 WHERE NEW.kind = 'bp' AND NEW.season IS NOT NULL
       ON CONFLICT (user_id, season) DO UPDATE SET premium = 1;
     UPDATE users SET first_purchase_done = 1 WHERE id = NEW.user_id;
   END`,
  `CREATE TRIGGER IF NOT EXISTS star_pay_bu BEFORE UPDATE ON star_payments BEGIN SELECT RAISE(ABORT, 'IMMUTABLE'); END`,
  `CREATE TRIGGER IF NOT EXISTS star_pay_bd BEFORE DELETE ON star_payments BEGIN SELECT RAISE(ABORT, 'IMMUTABLE'); END`,
  `CREATE TRIGGER IF NOT EXISTS feedback_bi BEFORE INSERT ON feedback BEGIN
     SELECT RAISE(ABORT, 'FEEDBACK_SHORT') WHERE length(trim(NEW.text)) < 5;
     SELECT RAISE(ABORT, 'FEEDBACK_LONG') WHERE length(NEW.text) > 1000;
     SELECT RAISE(ABORT, 'FEEDBACK_LIMIT') WHERE (SELECT count(*) FROM feedback WHERE user_id = NEW.user_id AND created_at > ${NOW} - 86400) >= 5;
     SELECT RAISE(ABORT, 'BAD_INPUT') WHERE NEW.created_at <> ${NOW} OR NEW.status <> 'new' OR NEW.answer IS NOT NULL;
   END`,
  // новое сообщение — уведомление всем админам в боте
  `CREATE TRIGGER IF NOT EXISTS feedback_ai AFTER INSERT ON feedback BEGIN
     INSERT INTO outbox (chat_id, kind, ref, created_at) SELECT id, 'feedback', NEW.id, ${NOW} FROM users WHERE is_admin = 1 AND id > 0;
   END`,
  // ответ админа — игроку в бота
  `CREATE TRIGGER IF NOT EXISTS feedback_answer AFTER UPDATE OF answer ON feedback WHEN NEW.answer IS NOT NULL AND OLD.answer IS NOT NEW.answer BEGIN
     INSERT INTO outbox (chat_id, kind, ref, created_at) VALUES (NEW.user_id, 'feedback_reply', NEW.id, ${NOW});
   END`,
];

const upsertProducts = () => STAR_PRODUCTS.map(([id, kind, stars, money, badge], i) =>
  `INSERT INTO star_products (id, kind, stars, money, badge, sort) VALUES ('${id}', '${kind}', ${stars}, ${money}, ${badge ? `'${badge}'` : 'NULL'}, ${i})
   ON CONFLICT (id) DO UPDATE SET kind = excluded.kind, stars = excluded.stars, money = excluded.money, badge = excluded.badge, sort = excluded.sort`);

// 8: новые цены — $50 000 за 50 звёзд (вся лестница ×2), VIP за 199 звёзд.
export const MIGRATION_8 = upsertProducts().filter((q) => !/'bp(dx|lvl)'/.test(q));

export const MIGRATION_7 = [
  ...tables,
  ...triggers,
  ...upsertProducts().filter((q) => !/'bp(dx|lvl)'/.test(q)),
  `INSERT INTO settings (k, v) VALUES ('kick_after', 2) ON CONFLICT (k) DO UPDATE SET v = excluded.v`,
];

// ---------- миграция 9 ----------
// VIP и премиум Battle Pass — только за звёзды. Премиум 99⭐ сразу даёт машину сезона (её
// выбирает админ), делюкс 49⭐ (только после премиума) — +5 уровней, уровень — 5⭐.
// 15 уровней, на 15-м — машины. Награда «model» — конкретная машина (value = id машины).
const LVL = (season) => `(SELECT xp_level FROM bp_seasons WHERE id = ${season})`;
const MAXXP = (season) => `((SELECT levels FROM bp_seasons WHERE id = ${season}) * ${LVL(season)})`;
const starPay9 = `CREATE TRIGGER IF NOT EXISTS star_pay_ai AFTER INSERT ON star_payments BEGIN
     ${post("'star:' || NEW.charge_id", 'NEW.user_id', 'stars', 'NEW.money')}
     INSERT INTO vip_grants (user_id, source, price, created_at)
       SELECT NEW.user_id, 'shop', 0, ${NOW} WHERE NEW.kind = 'vip';
     INSERT INTO bp_progress (user_id, season, xp, premium) SELECT NEW.user_id, NEW.season, 0, 0
       WHERE NEW.kind IN ('bp', 'bpdx', 'bplvl') AND NEW.season IS NOT NULL ON CONFLICT (user_id, season) DO NOTHING;
     UPDATE bp_progress SET premium = 1 WHERE NEW.kind = 'bp' AND user_id = NEW.user_id AND season = NEW.season;
     INSERT INTO car_grants (op_id, user_id, car_id, source, created_at)
       SELECT 'bpcar:' || NEW.season || ':' || NEW.user_id, NEW.user_id, prem_car_id, 'bp', ${NOW} FROM bp_seasons
       WHERE NEW.kind = 'bp' AND id = NEW.season AND prem_car_id IS NOT NULL;
     UPDATE bp_progress SET deluxe = 1, xp = min(xp + ${DELUXE_LEVELS} * ${LVL('NEW.season')}, ${MAXXP('NEW.season')})
       WHERE NEW.kind = 'bpdx' AND user_id = NEW.user_id AND season = NEW.season;
     UPDATE bp_progress SET xp = min((xp / ${LVL('NEW.season')} + 1) * ${LVL('NEW.season')}, ${MAXXP('NEW.season')})
       WHERE NEW.kind = 'bplvl' AND user_id = NEW.user_id AND season = NEW.season;
     UPDATE users SET first_purchase_done = 1 WHERE id = NEW.user_id AND NEW.kind <> 'refund';
   END`;
const claim9 = `CREATE TRIGGER IF NOT EXISTS bp_claim_bi BEFORE INSERT ON bp_claims BEGIN
     SELECT RAISE(ABORT, 'BP_LOCKED') WHERE COALESCE((SELECT xp FROM bp_progress WHERE user_id = NEW.user_id AND season = NEW.season), 0) < NEW.level * ${LVL('NEW.season')};
     SELECT RAISE(ABORT, 'BP_NOT_PREMIUM') WHERE NEW.track = 'premium'
       AND COALESCE((SELECT premium FROM bp_progress WHERE user_id = NEW.user_id AND season = NEW.season), 0) = 0;
     SELECT RAISE(ABORT, 'BAD_CLAIM') WHERE NEW.season IS NOT (SELECT id FROM bp_seasons WHERE starts_at <= ${NOW} AND ends_at > ${NOW} ORDER BY id DESC LIMIT 1)
       OR NEW.created_at <> ${NOW}
       OR NOT EXISTS (SELECT 1 FROM bp_levels WHERE season = NEW.season AND level = NEW.level AND level <= (SELECT levels FROM bp_seasons WHERE id = NEW.season))
       OR (NEW.car_id IS NULL) <> ((SELECT CASE NEW.track WHEN 'free' THEN free_kind ELSE prem_kind END FROM bp_levels WHERE season = NEW.season AND level = NEW.level) NOT IN ('car', 'model'))
       OR (NEW.car_id IS NOT NULL AND (SELECT CASE NEW.track WHEN 'free' THEN free_kind ELSE prem_kind END FROM bp_levels WHERE season = NEW.season AND level = NEW.level) = 'model'
           AND NEW.car_id IS NOT (SELECT CASE NEW.track WHEN 'free' THEN free_value ELSE prem_value END FROM bp_levels WHERE season = NEW.season AND level = NEW.level))
       OR (NEW.car_id IS NOT NULL AND (SELECT CASE NEW.track WHEN 'free' THEN free_kind ELSE prem_kind END FROM bp_levels WHERE season = NEW.season AND level = NEW.level) = 'car'
           AND (SELECT rarity FROM cars WHERE id = NEW.car_id) IS NOT
           (SELECT CASE CASE NEW.track WHEN 'free' THEN free_value ELSE prem_value END WHEN 1 THEN 'rare' WHEN 2 THEN 'epic' ELSE 'mythic' END
            FROM bp_levels WHERE season = NEW.season AND level = NEW.level));
   END`;
export const MIGRATION_9 = [
  'ALTER TABLE bp_progress ADD COLUMN deluxe INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE bp_seasons ADD COLUMN prem_car_id INTEGER',
  // в товарах появились делюкс и уровень — пересоздать таблицу с новым CHECK
  `CREATE TABLE IF NOT EXISTS star_products_v2 (
     id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('money', 'vip', 'bp', 'bpdx', 'bplvl')),
     stars INTEGER NOT NULL CHECK (stars > 0), money INTEGER NOT NULL DEFAULT 0 CHECK (money >= 0),
     badge TEXT, sort INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1
   )`,
  'INSERT INTO star_products_v2 SELECT id, kind, stars, money, badge, sort, is_active FROM star_products',
  'DROP TABLE star_products',
  'ALTER TABLE star_products_v2 RENAME TO star_products',
  // порядок в магазине: VIP, Battle Pass, деньги
  ...STAR_PRODUCTS.map(([id, kind, stars, money, badge]) =>
    `INSERT INTO star_products (id, kind, stars, money, badge, sort) VALUES ('${id}', '${kind}', ${stars}, ${money}, ${badge ? `'${badge}'` : 'NULL'}, ${({ vip: 0, bp: 1, bpdx: 2, bplvl: 3 })[id] ?? 10 + STAR_PRODUCTS.findIndex((x) => x[0] === id)})
     ON CONFLICT (id) DO UPDATE SET kind = excluded.kind, stars = excluded.stars, money = excluded.money, badge = excluded.badge, sort = excluded.sort`),
  'DROP TRIGGER IF EXISTS star_pay_ai', starPay9,
  'DROP TRIGGER IF EXISTS bp_claim_bi', claim9,
  // покупка премиума за игровые деньги закрыта
  'DROP TRIGGER IF EXISTS bp_buy_bi',
  "CREATE TRIGGER IF NOT EXISTS bp_buy_bi BEFORE INSERT ON bp_purchases BEGIN SELECT RAISE(ABORT, 'STARS_ONLY'); END",
  // 15 уровней: на 14-м деньги и контейнер «Весь мир», на 15-м — машины (редкая и легендарная)
  "INSERT INTO settings (k, v) VALUES ('bp_levels', 15) ON CONFLICT (k) DO UPDATE SET v = excluded.v",
  'UPDATE bp_seasons SET levels = 15 WHERE levels = 14',
  "UPDATE bp_levels SET free_kind = 'money', free_value = 7000, prem_kind = 'container', prem_value = 8 WHERE level = 14",
  "INSERT INTO bp_levels (season, level, free_kind, free_value, prem_kind, prem_value) SELECT id, 15, 'car', 1, 'car', 3 FROM bp_seasons WHERE true ON CONFLICT DO NOTHING",
  // машина за покупку премиума — по умолчанию легендарная Riviera Hypersport, админ меняет
  "UPDATE bp_seasons SET prem_car_id = (SELECT id FROM cars WHERE name = 'Riviera Hypersport') WHERE prem_car_id IS NULL AND ends_at > " + NOW,
];

// ---------- миграция 10 ----------
// VIP — 149⭐. В Battle Pass легендарных машин нет: премиум даёт эпическую машину сезона,
// легендарная — только в делюксе (выдаётся сразу при покупке делюкса).
const starPay10 = starPay9.replace(
  "UPDATE bp_progress SET deluxe = 1,",
  `INSERT INTO car_grants (op_id, user_id, car_id, source, created_at)
       SELECT 'bpdx:' || NEW.season || ':' || NEW.user_id, NEW.user_id, dx_car_id, 'bp', ${NOW} FROM bp_seasons
       WHERE NEW.kind = 'bpdx' AND id = NEW.season AND dx_car_id IS NOT NULL;
     UPDATE bp_progress SET deluxe = 1,`);
export const MIGRATION_10 = [
  'ALTER TABLE bp_seasons ADD COLUMN dx_car_id INTEGER',
  "UPDATE star_products SET stars = 149 WHERE id = 'vip'",
  // легендарная машина сезона переезжает в делюкс, за премиум — эпическая
  "UPDATE bp_seasons SET dx_car_id = COALESCE(prem_car_id, (SELECT id FROM cars WHERE name = 'Riviera Hypersport')) WHERE ends_at > " + NOW,
  "UPDATE bp_seasons SET prem_car_id = (SELECT id FROM cars WHERE name = 'Toro Tempesta') WHERE ends_at > " + NOW,
  // наград-легендарок в пассе не остаётся: 15-й уровень премиума — эпическая машина
  "UPDATE bp_levels SET prem_value = 2 WHERE prem_kind = 'car' AND prem_value = 3",
  "UPDATE bp_levels SET free_value = 2 WHERE free_kind = 'car' AND free_value = 3",
  'DROP TRIGGER IF EXISTS star_pay_ai', starPay10,
];
