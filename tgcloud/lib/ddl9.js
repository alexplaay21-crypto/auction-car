// ddl9.js — миграция 20: гонки, где игрок управляет сам (lib/drive.js).
// drives — заезд игрока: ставка списывается в залог при старте (бросил заезд — ставка сгорает),
// по окончании сервер пересчитывает заезд по нажатиям и создаёт запись в races.
//  bot   — против бота: победа возвращает залог и +90% ставки;
//  host  — свой вызов: после заезда появляется открытый вызов с готовым временем;
//  guest — принятие вызова: едешь против «призрака» автора вызова; если вызов успел принять
//          другой игрок — залог возвращается.
// Старые открытые вызовы (с прежним расчётом времени) отменяются с возвратом ставки.
import { NOW, S, RATE, post } from './sql.js';
import { CUR_SEASON } from './ddl3.js';

export const DNF = 999_999;
const XP = (u, n) => `INSERT INTO bp_progress (user_id, season, xp) SELECT ${u}, ${CUR_SEASON}, ${n} WHERE ${u} IS NOT NULL AND ${CUR_SEASON} IS NOT NULL
  ON CONFLICT (user_id, season) DO UPDATE SET xp = xp + excluded.xp;`;
const OWNS = (u, uc) => `EXISTS (SELECT 1 FROM user_cars WHERE id = ${uc} AND user_id = ${u} AND status = 'owned')`;
const BOT_WIN = `(NEW.stake * ${S('race_bot_win_bps')} / 10000)`;
const POT = `(NEW.stake * 2 * (10000 - ${S('race_pvp_fee_bps')}) / 10000)`;
const DRIVE_OK = (id, u, ms, mode) => `EXISTS (SELECT 1 FROM drives WHERE id = ${id} AND user_id = ${u} AND status = 'done' AND ms = ${ms}
  AND stake = NEW.stake AND track = NEW.track AND mode = ${mode})`;

export const MIGRATION_20 = [
  `CREATE TABLE IF NOT EXISTS drives (
     id INTEGER PRIMARY KEY AUTOINCREMENT, op_id TEXT NOT NULL UNIQUE,
     user_id INTEGER NOT NULL, user_car INTEGER NOT NULL, car_id INTEGER NOT NULL,
     mode TEXT NOT NULL CHECK (mode IN ('bot', 'host', 'guest')), race_id INTEGER,
     track TEXT NOT NULL CHECK (track IN ('drag', 'circuit', 'rally')), stake INTEGER NOT NULL CHECK (stake > 0),
     seed INTEGER NOT NULL, reaction_x1000 INTEGER NOT NULL,
     bot_car INTEGER, bot_a INTEGER, bot_ms INTEGER,
     status TEXT NOT NULL CHECK (status IN ('driving', 'done', 'expired', 'refunded')),
     ms INTEGER, hits INTEGER, inputs TEXT, created_at INTEGER NOT NULL, finished_at INTEGER
   )`,
  `CREATE INDEX IF NOT EXISTS idx_drives_user ON drives (user_id, status)`,
  'ALTER TABLE races ADD COLUMN held INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE races ADD COLUMN seed INTEGER',
  'ALTER TABLE races ADD COLUMN host_drive INTEGER',
  'ALTER TABLE races ADD COLUMN guest_drive INTEGER',
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_races_host_drive ON races (host_drive) WHERE host_drive IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_races_guest_drive ON races (guest_drive) WHERE guest_drive IS NOT NULL`,

  `CREATE TRIGGER IF NOT EXISTS drives_bi BEFORE INSERT ON drives BEGIN
     SELECT RAISE(ABORT, 'USER_BANNED') WHERE (SELECT is_banned FROM users WHERE id = NEW.user_id) = 1;
     SELECT RAISE(ABORT, 'CAR_NOT_FOUND') WHERE NOT ${OWNS('NEW.user_id', 'NEW.user_car')}
       OR NEW.car_id IS NOT (SELECT car_id FROM user_cars WHERE id = NEW.user_car);
     SELECT RAISE(ABORT, 'BAD_STAKE') WHERE NEW.stake < ${S('race_min_stake')} OR NEW.stake > ${S('race_max_stake')};
     SELECT RAISE(ABORT, 'NOT_ENOUGH_MONEY') WHERE (SELECT balance FROM users WHERE id = NEW.user_id) < NEW.stake;
     SELECT RAISE(ABORT, 'BAD_RACE') WHERE NEW.created_at <> ${NOW} OR NEW.status <> 'driving' OR NEW.ms IS NOT NULL
       OR (NEW.mode = 'bot' AND (NEW.bot_car IS NULL OR NEW.bot_ms IS NULL))
       OR (NEW.mode <> 'guest' AND NEW.race_id IS NOT NULL);
     SELECT RAISE(ABORT, 'RACE_CLOSED') WHERE NEW.mode = 'guest' AND NOT EXISTS (SELECT 1 FROM races WHERE id = NEW.race_id AND status = 'open'
       AND held = 1 AND stake = NEW.stake AND track = NEW.track AND seed = NEW.seed);
     SELECT RAISE(ABORT, 'SELF_RACE') WHERE NEW.mode = 'guest' AND (SELECT host_id FROM races WHERE id = NEW.race_id) = NEW.user_id;
     SELECT RAISE(ABORT, 'TOO_MANY_RACES') WHERE NEW.mode = 'host' AND (SELECT count(*) FROM races WHERE host_id = NEW.user_id AND status = 'open') >= 3;
     SELECT RAISE(ABORT, 'DRIVE_ACTIVE') WHERE EXISTS (SELECT 1 FROM drives WHERE user_id = NEW.user_id AND status = 'driving');
   END`,
  `CREATE TRIGGER IF NOT EXISTS drives_ai AFTER INSERT ON drives BEGIN
     ${post("'drive:' || NEW.id", 'NEW.user_id', 'race_hold', '-NEW.stake', 'NEW.id')}
   END`,
  `CREATE TRIGGER IF NOT EXISTS drives_bu BEFORE UPDATE ON drives BEGIN
     SELECT RAISE(ABORT, 'IMMUTABLE') WHERE NEW.user_id <> OLD.user_id OR NEW.user_car <> OLD.user_car OR NEW.car_id <> OLD.car_id
       OR NEW.mode <> OLD.mode OR NEW.race_id IS NOT OLD.race_id OR NEW.track <> OLD.track OR NEW.stake <> OLD.stake OR NEW.seed <> OLD.seed
       OR NEW.reaction_x1000 <> OLD.reaction_x1000 OR NEW.bot_car IS NOT OLD.bot_car OR NEW.bot_ms IS NOT OLD.bot_ms OR NEW.created_at <> OLD.created_at;
     SELECT RAISE(ABORT, 'DRIVE_CLOSED') WHERE OLD.status <> 'driving';
     SELECT RAISE(ABORT, 'BAD_RACE') WHERE NEW.finished_at IS NOT ${NOW}
       OR (NEW.status = 'done' AND (NEW.ms IS NULL OR NEW.inputs IS NULL))
       OR (NEW.status = 'refunded' AND (NEW.mode <> 'guest' OR EXISTS (SELECT 1 FROM races WHERE id = OLD.race_id AND status = 'open')))
       OR NEW.status = 'driving';
   END`,
  // заезд закончен — итог в races одним действием: бот — сразу результат, вызов — открытый вызов,
  // принятие — итог вызова (если вызов уже принял другой — залог возвращается)
  `CREATE TRIGGER IF NOT EXISTS drives_done AFTER UPDATE OF status ON drives WHEN OLD.status = 'driving' AND NEW.status = 'done' BEGIN
     INSERT INTO races (op_id, kind, track, status, stake, host_id, host_car, host_ms, guest_ms, bot_car, winner_id, held, seed, host_drive, created_at, resolved_at)
       SELECT 'drive:' || NEW.id, 'bot', NEW.track, 'done', NEW.stake, NEW.user_id, NEW.user_car, NEW.ms, NEW.bot_ms, NEW.bot_car,
         CASE WHEN NEW.ms < NEW.bot_ms THEN NEW.user_id END, 1, NEW.seed, NEW.id, ${NOW}, ${NOW} WHERE NEW.mode = 'bot';
     INSERT INTO races (op_id, kind, track, status, stake, host_id, host_car, host_ms, held, seed, host_drive, created_at)
       SELECT 'drive:' || NEW.id, 'pvp', NEW.track, 'open', NEW.stake, NEW.user_id, NEW.user_car, NEW.ms, 1, NEW.seed, NEW.id, ${NOW}
       WHERE NEW.mode = 'host' AND NEW.ms < ${DNF};
     UPDATE races SET status = 'done', guest_id = NEW.user_id, guest_car = NEW.user_car, guest_ms = NEW.ms, guest_drive = NEW.id,
         winner_id = CASE WHEN host_ms <= NEW.ms THEN host_id ELSE NEW.user_id END, resolved_at = ${NOW}
       WHERE id = NEW.race_id AND status = 'open' AND NEW.mode = 'guest';
     ${post("'driverefund:' || NEW.id", 'NEW.user_id', 'race_refund', `CASE WHEN NEW.mode = 'guest' AND NOT EXISTS (SELECT 1 FROM races WHERE guest_drive = NEW.id) THEN NEW.stake ELSE 0 END`, 'NEW.id')}
   END`,
  `CREATE TRIGGER IF NOT EXISTS drives_refund AFTER UPDATE OF status ON drives WHEN NEW.status = 'refunded' BEGIN
     ${post("'driverefund:' || NEW.id", 'NEW.user_id', 'race_refund', 'NEW.stake', 'NEW.id')}
   END`,

  // races: те же правила, плюс заезды с залогом (held = 1) — их время подтверждено drives
  'DROP TRIGGER IF EXISTS races_bi',
  `CREATE TRIGGER IF NOT EXISTS races_bi BEFORE INSERT ON races BEGIN
     SELECT RAISE(ABORT, 'USER_BANNED') WHERE (SELECT is_banned FROM users WHERE id = NEW.host_id) = 1;
     SELECT RAISE(ABORT, 'CAR_NOT_FOUND') WHERE NEW.held = 0 AND NOT ${OWNS('NEW.host_id', 'NEW.host_car')};
     SELECT RAISE(ABORT, 'BAD_STAKE') WHERE NEW.stake < ${S('race_min_stake')} OR NEW.stake > ${S('race_max_stake')};
     SELECT RAISE(ABORT, 'BAD_RACE') WHERE NEW.created_at <> ${NOW}
       OR (NEW.kind = 'bot' AND (NEW.status <> 'done' OR NEW.bot_car IS NULL OR NEW.host_ms IS NULL OR NEW.guest_ms IS NULL
           OR NEW.winner_id IS NOT (CASE WHEN NEW.host_ms < NEW.guest_ms THEN NEW.host_id END) OR NEW.resolved_at IS NOT ${NOW}))
       OR (NEW.kind = 'pvp' AND (NEW.status <> 'open' OR NEW.guest_id IS NOT NULL OR NEW.winner_id IS NOT NULL OR (NEW.held = 0 AND NEW.host_ms IS NOT NULL)))
       OR (NEW.held = 1 AND (NEW.host_drive IS NULL OR NEW.seed IS NULL
           OR NOT ${DRIVE_OK('NEW.host_drive', 'NEW.host_id', 'NEW.host_ms', "CASE NEW.kind WHEN 'bot' THEN 'bot' ELSE 'host' END")}
           OR NEW.seed IS NOT (SELECT seed FROM drives WHERE id = NEW.host_drive) OR NEW.host_car IS NOT (SELECT user_car FROM drives WHERE id = NEW.host_drive)
           OR (NEW.kind = 'bot' AND (NEW.guest_ms IS NOT (SELECT bot_ms FROM drives WHERE id = NEW.host_drive) OR NEW.bot_car IS NOT (SELECT bot_car FROM drives WHERE id = NEW.host_drive)))))
       OR (NEW.held = 0 AND NEW.host_drive IS NOT NULL);
     SELECT RAISE(ABORT, 'TOO_MANY_RACES') WHERE NEW.kind = 'pvp' AND (SELECT count(*) FROM races WHERE host_id = NEW.host_id AND status = 'open') >= 3;
   END`,
  'DROP TRIGGER IF EXISTS races_ai',
  `CREATE TRIGGER IF NOT EXISTS races_ai AFTER INSERT ON races BEGIN
     -- без залога: как раньше; с залогом: победа над ботом возвращает залог + 90% ставки
     ${post("'race:' || NEW.id", 'NEW.host_id', 'race', `CASE WHEN NEW.held = 1 THEN CASE WHEN NEW.kind = 'bot' AND NEW.winner_id = NEW.host_id THEN NEW.stake + ${BOT_WIN} ELSE 0 END
       WHEN NEW.kind = 'bot' AND NEW.winner_id = NEW.host_id THEN ${BOT_WIN} ELSE -NEW.stake END`, 'NEW.id')}
     ${XP('NEW.host_id', "CASE WHEN NEW.kind = 'bot' THEN CASE WHEN NEW.winner_id = NEW.host_id THEN 100 ELSE 60 END ELSE 0 END")}
   END`,
  'DROP TRIGGER IF EXISTS races_bu',
  `CREATE TRIGGER IF NOT EXISTS races_bu BEFORE UPDATE ON races BEGIN
     SELECT RAISE(ABORT, 'IMMUTABLE') WHERE NEW.kind <> OLD.kind OR NEW.stake <> OLD.stake OR NEW.host_id <> OLD.host_id
       OR NEW.host_car <> OLD.host_car OR NEW.track <> OLD.track OR NEW.held <> OLD.held OR NEW.seed IS NOT OLD.seed
       OR NEW.host_drive IS NOT OLD.host_drive OR (OLD.held = 1 AND NEW.host_ms IS NOT OLD.host_ms);
     SELECT RAISE(ABORT, 'RACE_CLOSED') WHERE OLD.status <> 'open';
     SELECT RAISE(ABORT, 'SELF_RACE') WHERE NEW.status = 'done' AND NEW.guest_id = OLD.host_id;
     SELECT RAISE(ABORT, 'CAR_NOT_FOUND') WHERE NEW.status = 'done' AND OLD.held = 0 AND NOT ${OWNS('NEW.guest_id', 'NEW.guest_car')};
     SELECT RAISE(ABORT, 'HOST_CAR_GONE') WHERE NEW.status = 'done' AND OLD.held = 0 AND NOT ${OWNS('OLD.host_id', 'OLD.host_car')};
     SELECT RAISE(ABORT, 'BAD_RACE') WHERE NEW.resolved_at IS NOT ${NOW}
       OR (NEW.status = 'done' AND (NEW.host_ms IS NULL OR NEW.guest_ms IS NULL
           OR NEW.winner_id IS NOT (CASE WHEN NEW.host_ms <= NEW.guest_ms THEN OLD.host_id ELSE NEW.guest_id END)))
       OR (NEW.status = 'done' AND OLD.held = 1 AND (NEW.guest_drive IS NULL
           OR NOT EXISTS (SELECT 1 FROM drives WHERE id = NEW.guest_drive AND user_id = NEW.guest_id AND mode = 'guest' AND race_id = OLD.id
             AND status = 'done' AND ms = NEW.guest_ms AND user_car = NEW.guest_car)));
   END`,
  'DROP TRIGGER IF EXISTS races_done',
  `CREATE TRIGGER IF NOT EXISTS races_done AFTER UPDATE OF status ON races WHEN OLD.status = 'open' BEGIN
     ${post("'race:' || NEW.id", 'NEW.guest_id', 'race', `CASE WHEN NEW.status = 'done' AND NEW.held = 0 THEN -NEW.stake ELSE 0 END`, 'NEW.id')}
     ${post("'racewin:' || NEW.id", 'NEW.winner_id', 'race_win', `CASE WHEN NEW.status = 'done' THEN ${POT} ELSE 0 END`, 'NEW.id')}
     ${post("'racecancel:' || NEW.id", 'NEW.host_id', 'race_refund', `CASE WHEN NEW.status = 'cancelled' THEN NEW.stake ELSE 0 END`, 'NEW.id')}
     ${XP('NEW.host_id', "CASE WHEN NEW.status = 'done' THEN CASE WHEN NEW.winner_id = NEW.host_id THEN 100 ELSE 60 END ELSE 0 END")}
     ${XP('NEW.guest_id', "CASE WHEN NEW.status = 'done' THEN CASE WHEN NEW.winner_id = NEW.guest_id THEN 100 ELSE 60 END ELSE 0 END")}
   END`,
  // старые вызовы считались по формуле — отменить с возвратом ставки
  `UPDATE races SET status = 'cancelled', resolved_at = ${NOW} WHERE status = 'open' AND held = 0`,
];

// Миграция 21: VIP — в подарок BMW M5 F90 (настройка vip_car_id; уже купившие VIP получают её сейчас),
// быстрая продажа для VIP доступна 2 часа после получения машины (остальным — 15 минут);
// премиум Battle Pass со скидкой: 49⭐ вместо 99⭐ (зачёркнутая цена — star_products.was_stars).
export const VIP_CAR_ID = 14;
const WINDOW = (u) => `(CASE WHEN (SELECT is_vip FROM users WHERE id = ${u}) = 1 THEN ${S('quick_sell_window_vip_s')} ELSE ${S('quick_sell_window_s')} END)`;
const SELL_RATE = (uc, u) => `(CASE WHEN ${NOW} - (SELECT obtained_at FROM user_cars WHERE id = ${uc}) <= ${WINDOW(u)}
  THEN ${RATE('comm_quick', u)} ELSE ${RATE('comm_state', u)} END)`;
const VIP_CAR = (u) => `INSERT INTO car_grants (op_id, user_id, car_id, source, created_at)
  SELECT 'vipcar:' || ${u}, ${u}, ${S('vip_car_id')}, 'shop', ${NOW}
  WHERE NOT EXISTS (SELECT 1 FROM car_grants WHERE op_id = 'vipcar:' || ${u});`;
export const MIGRATION_21 = [
  `INSERT INTO settings (k, v) VALUES ('quick_sell_window_vip_s', 7200) ON CONFLICT (k) DO UPDATE SET v = excluded.v`,
  `INSERT INTO settings (k, v) VALUES ('vip_car_id', ${VIP_CAR_ID}) ON CONFLICT (k) DO NOTHING`,
  'DROP TRIGGER IF EXISTS car_sales_bi',
  `CREATE TRIGGER IF NOT EXISTS car_sales_bi BEFORE INSERT ON car_sales BEGIN
     SELECT RAISE(ABORT, 'CAR_NOT_FOUND') WHERE NOT EXISTS (
       SELECT 1 FROM user_cars WHERE id = NEW.user_car_id AND user_id = NEW.user_id AND status = 'owned');
     SELECT RAISE(ABORT, 'BAD_SALE') WHERE NEW.created_at <> ${NOW} OR NEW.rate_bps <> ${SELL_RATE('NEW.user_car_id', 'NEW.user_id')}
       OR NEW.amount <> (SELECT c.price FROM user_cars u JOIN cars c ON c.id = u.car_id WHERE u.id = NEW.user_car_id) * (10000 - NEW.rate_bps) / 10000;
   END`,
  `CREATE TRIGGER IF NOT EXISTS vip_car AFTER INSERT ON vip_grants BEGIN
     ${VIP_CAR('NEW.user_id')}
   END`,
  `INSERT INTO car_grants (op_id, user_id, car_id, source, created_at)
     SELECT 'vipcar:' || id, id, ${S('vip_car_id')}, 'shop', ${NOW} FROM users
     WHERE is_vip = 1 AND NOT EXISTS (SELECT 1 FROM car_grants WHERE op_id = 'vipcar:' || users.id)`,
  'ALTER TABLE star_products ADD COLUMN was_stars INTEGER',
  `UPDATE star_products SET stars = 49, was_stars = 99 WHERE id = 'bp'`,
];
