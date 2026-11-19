// ddl7.js — миграция 11: оформление профиля (фоны и рамки аватара) за игровые деньги,
// эпическая машина за каждых 5 приглашённых друзей.
import { NOW, post } from './sql.js';

// id, вид, название, цена. Вид эффекта задаёт CSS-класс в Mini App (bg-<id> / f-<id>).
export const COSMETICS = [
  ['carbon', 'bg', 'Карбон', 25_000],
  ['checker', 'bg', 'Финишный флаг', 40_000],
  ['neon', 'bg', 'Неоновая трасса', 75_000],
  ['flames', 'bg', 'Пламя', 120_000],
  ['galaxy', 'bg', 'Галактика', 200_000],
  ['aurora', 'bg', 'Северное сияние', 300_000],
  ['goldrush', 'bg', 'Золотая лихорадка', 500_000],
  ['chrome', 'frame', 'Хром', 20_000],
  ['fire', 'frame', 'Огонь', 60_000],
  ['pulse', 'frame', 'Неоновый пульс', 90_000],
  ['rainbow', 'frame', 'Радуга', 150_000],
  ['gold', 'frame', 'Золото', 300_000],
  ['legend', 'frame', 'Легенда', 600_000],
];

export const MIGRATION_11 = [
  `CREATE TABLE IF NOT EXISTS cosmetics (
     id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('bg', 'frame')), name TEXT NOT NULL,
     price INTEGER NOT NULL CHECK (price > 0), sort INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1
   )`,
  `CREATE TABLE IF NOT EXISTS user_cosmetics (
     user_id INTEGER NOT NULL, cosmetic_id TEXT NOT NULL, price INTEGER NOT NULL, created_at INTEGER NOT NULL,
     PRIMARY KEY (user_id, cosmetic_id)
   )`,
  'ALTER TABLE users ADD COLUMN profile_bg TEXT',
  'ALTER TABLE users ADD COLUMN profile_frame TEXT',
  `CREATE TRIGGER IF NOT EXISTS cos_buy_bi BEFORE INSERT ON user_cosmetics BEGIN
     SELECT RAISE(ABORT, 'ITEM_UNAVAILABLE') WHERE NOT EXISTS (SELECT 1 FROM cosmetics WHERE id = NEW.cosmetic_id AND is_active = 1);
     SELECT RAISE(ABORT, 'BAD_PURCHASE') WHERE NEW.price <> (SELECT price FROM cosmetics WHERE id = NEW.cosmetic_id) OR NEW.created_at <> ${NOW};
   END`,
  // покупка: списать деньги и сразу надеть
  `CREATE TRIGGER IF NOT EXISTS cos_buy_ai AFTER INSERT ON user_cosmetics BEGIN
     ${post("'cos:' || NEW.cosmetic_id", 'NEW.user_id', 'cosmetic', '-NEW.price')}
     UPDATE users SET profile_bg = NEW.cosmetic_id WHERE id = NEW.user_id AND (SELECT kind FROM cosmetics WHERE id = NEW.cosmetic_id) = 'bg';
     UPDATE users SET profile_frame = NEW.cosmetic_id WHERE id = NEW.user_id AND (SELECT kind FROM cosmetics WHERE id = NEW.cosmetic_id) = 'frame';
   END`,
  `CREATE TRIGGER IF NOT EXISTS cos_no_change BEFORE UPDATE ON user_cosmetics BEGIN SELECT RAISE(ABORT, 'IMMUTABLE'); END`,
  // надеть можно только своё и только подходящего вида
  `CREATE TRIGGER IF NOT EXISTS users_cos_bu BEFORE UPDATE OF profile_bg, profile_frame ON users BEGIN
     SELECT RAISE(ABORT, 'NOT_OWNED') WHERE NEW.profile_bg IS NOT NULL AND NEW.profile_bg IS NOT OLD.profile_bg
       AND NOT EXISTS (SELECT 1 FROM user_cosmetics uc JOIN cosmetics c ON c.id = uc.cosmetic_id WHERE uc.user_id = NEW.id AND uc.cosmetic_id = NEW.profile_bg AND c.kind = 'bg');
     SELECT RAISE(ABORT, 'NOT_OWNED') WHERE NEW.profile_frame IS NOT NULL AND NEW.profile_frame IS NOT OLD.profile_frame
       AND NOT EXISTS (SELECT 1 FROM user_cosmetics uc JOIN cosmetics c ON c.id = uc.cosmetic_id WHERE uc.user_id = NEW.id AND uc.cosmetic_id = NEW.profile_frame AND c.kind = 'frame');
   END`,
  ...COSMETICS.map(([id, kind, name, price], i) => `INSERT INTO cosmetics (id, kind, name, price, sort) VALUES ('${id}', '${kind}', '${name}', ${price}, ${i})
     ON CONFLICT (id) DO UPDATE SET kind = excluded.kind, name = excluded.name, price = excluded.price, sort = excluded.sort`),
  "INSERT INTO settings (k, v) VALUES ('ref_epic_every', 5) ON CONFLICT (k) DO UPDATE SET v = excluded.v",
];
