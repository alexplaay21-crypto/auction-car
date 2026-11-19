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
  ['vip', 'vip', 199, 0, null],
  ['bp', 'bp', 149, 0, null],
];

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
export const MIGRATION_8 = upsertProducts();

export const MIGRATION_7 = [
  ...tables,
  ...triggers,
  ...STAR_PRODUCTS.map(([id, kind, stars, money, badge], i) =>
    `INSERT INTO star_products (id, kind, stars, money, badge, sort) VALUES ('${id}', '${kind}', ${stars}, ${money}, ${badge ? `'${badge}'` : 'NULL'}, ${i})
     ON CONFLICT (id) DO UPDATE SET kind = excluded.kind, stars = excluded.stars, money = excluded.money, badge = excluded.badge, sort = excluded.sort`),
  `INSERT INTO settings (k, v) VALUES ('kick_after', 2) ON CONFLICT (k) DO UPDATE SET v = excluded.v`,
];
