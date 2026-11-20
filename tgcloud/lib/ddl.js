// lib/ddl.js — схема базы Car Auction: таблицы, индексы и триггеры.
// Деньги — целые доллары игры ($). Каждая денежная операция — одна команда, всё
// остальное делают триггеры (см. lib/sql.js). Журнал ledger неизменяем: баланс игрока
// всегда равен сумме его записей в журнале (проверяет audit()).
import { NOW, DAY, S, RATE, OWNED, CAPACITY, post, giveCar } from './sql.js';
import { CATALOG, CONTAINERS, GARAGE_TIERS } from './catalog.js';
import { MIGRATION_3, MIGRATION_4, MIGRATION_5 } from './ddl3.js';
import { MIGRATION_7, MIGRATION_8, MIGRATION_9, MIGRATION_10 } from './ddl6.js';
import { MIGRATION_11 } from './ddl7.js';
import { MIGRATION_12, MIGRATION_13, MIGRATION_14, MIGRATION_15, MIGRATION_16, MIGRATION_17, MIGRATION_18 } from './ddl8.js';

export const SETTINGS = {
  start_balance: 15_000,
  bet_step: 500,              // минимальный шаг ставки
  auction_timer_s: 30,        // таймер контейнера; каждая ставка запускает его заново
  next_delay_s: 5,            // пауза между контейнерами
  kick_after: 2,              // кик после N контейнеров подряд без ставок
  max_players: 30,
  quick_sell_window_s: 900,   // «быстрая продажа» доступна 15 минут после получения
  chance_common: 60, chance_rare: 30, chance_epic: 9, chance_mythic: 1,
  comm_quick_bps: 1000, comm_quick_vip_bps: 500,       // быстрая продажа 10% / 5%
  comm_state_bps: 4000, comm_state_vip_bps: 3000,      // продажа государству 40% / 30%
  comm_player_bps: 2500, comm_player_vip_bps: 1500,    // продажа игроку 25% / 15%
  comm_transfer_bps: 1000, comm_transfer_vip_bps: 0,   // перевод 10% / 0%
  daily_bonus: 1_000, daily_bonus_vip: 2_000,
  vip_price: 500_000,
  garage_start: 15, garage_max: 50, garage_vip_bonus: 10,
  ref_inviter: 10_000, ref_invited: 5_000, ref_first_purchase: 30_000, ref_epic_every: 5,
  sale_offer_ttl_s: 900,
  min_transfer: 1,
  shop_enabled: 1,
};

function immutable(table) {
  return [
    `CREATE TRIGGER IF NOT EXISTS ${table}_no_update BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT, 'IMMUTABLE'); END`,
    `CREATE TRIGGER IF NOT EXISTS ${table}_no_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT, 'IMMUTABLE'); END`,
  ];
}

const ACTIVE_MEMBERS = (room) => `(SELECT count(*) FROM room_members WHERE room_id = ${room} AND left_at IS NULL)`;
const IN_POOL = (container, car) => `EXISTS (SELECT 1 FROM container_cars cc JOIN cars c ON c.id = cc.car_id
  WHERE cc.container_id = ${container} AND cc.car_id = ${car} AND c.is_active = 1)`;
const SELL_RATE = (uc, u) => `(CASE WHEN ${NOW} - (SELECT obtained_at FROM user_cars WHERE id = ${uc}) <= ${S('quick_sell_window_s')}
  THEN ${RATE('comm_quick', u)} ELSE ${RATE('comm_state', u)} END)`;

const schema = [
  `CREATE TABLE IF NOT EXISTS sys_clock (id INTEGER PRIMARY KEY CHECK (id = 1), offset_s INTEGER NOT NULL DEFAULT 0)`,
  `CREATE VIEW IF NOT EXISTS v_now AS SELECT unixepoch() + COALESCE((SELECT offset_s FROM sys_clock WHERE id = 1), 0) AS now`,
  `CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v INTEGER NOT NULL)`,

  // ---------- игроки ----------
  `CREATE TABLE IF NOT EXISTS users (
     id INTEGER PRIMARY KEY,                -- Telegram user id
     username TEXT, first_name TEXT, photo_url TEXT,
     balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
     is_vip INTEGER NOT NULL DEFAULT 0 CHECK (is_vip IN (0, 1)), vip_since INTEGER,
     is_admin INTEGER NOT NULL DEFAULT 0, is_banned INTEGER NOT NULL DEFAULT 0, ban_reason TEXT,
     referred_by INTEGER,
     garage_capacity INTEGER NOT NULL DEFAULT 15 CHECK (garage_capacity > 0),
     last_bonus_day INTEGER NOT NULL DEFAULT 0,
     containers_opened INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0,
     bids_made INTEGER NOT NULL DEFAULT 0, cars_obtained INTEGER NOT NULL DEFAULT 0,
     cars_sold INTEGER NOT NULL DEFAULT 0, spent_total INTEGER NOT NULL DEFAULT 0,
     earned_total INTEGER NOT NULL DEFAULT 0, referrals_count INTEGER NOT NULL DEFAULT 0,
     first_purchase_done INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE INDEX IF NOT EXISTS idx_users_username ON users (lower(username))`,
  `CREATE TABLE IF NOT EXISTS ledger (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     op_id TEXT NOT NULL, user_id INTEGER NOT NULL, kind TEXT NOT NULL,
     delta INTEGER NOT NULL, balance_after INTEGER NOT NULL, ref INTEGER, created_at INTEGER NOT NULL,
     UNIQUE (op_id, user_id, kind)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_ledger_user ON ledger (user_id, id)`,
  ...immutable('ledger'),

  // ---------- каталог ----------
  `CREATE TABLE IF NOT EXISTS cars (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 64), country TEXT,
     rarity TEXT NOT NULL CHECK (rarity IN ('common', 'rare', 'epic', 'mythic')),
     max_speed INTEGER NOT NULL, accel_x100 INTEGER NOT NULL, power INTEGER NOT NULL,
     handling INTEGER NOT NULL, reliability INTEGER NOT NULL,
     price INTEGER NOT NULL CHECK (price > 0),
     color TEXT, body TEXT,
     is_active INTEGER NOT NULL DEFAULT 1
   )`,
  `CREATE TABLE IF NOT EXISTS containers (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL, country TEXT, emoji TEXT,
     price INTEGER NOT NULL CHECK (price > 0),
     is_enabled INTEGER NOT NULL DEFAULT 1,
     chance_common INTEGER, chance_rare INTEGER, chance_epic INTEGER, chance_mythic INTEGER
   )`,
  `CREATE TABLE IF NOT EXISTS container_cars (
     container_id INTEGER NOT NULL, car_id INTEGER NOT NULL, weight INTEGER NOT NULL DEFAULT 1 CHECK (weight >= 0),
     PRIMARY KEY (container_id, car_id)
   )`,
  // фото машин, контейнеров и лотов (загружаются в Mini App); file_id — кэш для бота
  `CREATE TABLE IF NOT EXISTS images (
     kind TEXT NOT NULL, ref_id INTEGER NOT NULL, mime TEXT NOT NULL, data TEXT NOT NULL,
     v INTEGER NOT NULL DEFAULT 1, file_id TEXT, updated_at INTEGER NOT NULL,
     PRIMARY KEY (kind, ref_id)
   )`,
  `CREATE TABLE IF NOT EXISTS garage_tiers (capacity INTEGER PRIMARY KEY, price INTEGER NOT NULL CHECK (price > 0))`,

  // ---------- гараж ----------
  `CREATE TABLE IF NOT EXISTS user_cars (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id INTEGER NOT NULL, car_id INTEGER NOT NULL,
     source TEXT NOT NULL, source_ref INTEGER, paid INTEGER NOT NULL DEFAULT 0,
     obtained_at INTEGER NOT NULL,
     status TEXT NOT NULL DEFAULT 'owned' CHECK (status IN ('owned', 'sold')),
     sold_amount INTEGER, sold_at INTEGER, sold_to INTEGER
   )`,
  `CREATE INDEX IF NOT EXISTS idx_uc_user ON user_cars (user_id, status, id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_uc_source ON user_cars (source, source_ref) WHERE source_ref IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS user_containers (
     user_id INTEGER NOT NULL, container_id INTEGER NOT NULL, qty INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0),
     PRIMARY KEY (user_id, container_id)
   )`,

  // ---------- комнаты и аукционы ----------
  // scope: 'global' — общая очередь (личка бота + Mini App), 'group' — комнаты группы (scope_id = chat id)
  `CREATE TABLE IF NOT EXISTS rooms (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     scope TEXT NOT NULL CHECK (scope IN ('global', 'group')), scope_id INTEGER NOT NULL DEFAULT 0,
     number INTEGER NOT NULL,
     status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
     max_players INTEGER NOT NULL,
     stop_requested INTEGER NOT NULL DEFAULT 0,
     next_at INTEGER NOT NULL DEFAULT 0,      -- когда можно запускать следующий контейнер
     rev INTEGER NOT NULL DEFAULT 0,          -- растёт при любом изменении (для обновления сообщений)
     created_at INTEGER NOT NULL, closed_at INTEGER,
     UNIQUE (scope, scope_id, number)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_rooms_open ON rooms (status, next_at)`,
  `CREATE TABLE IF NOT EXISTS room_members (
     room_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
     joined_at INTEGER NOT NULL, left_at INTEGER, missed INTEGER NOT NULL DEFAULT 0, kicked INTEGER NOT NULL DEFAULT 0,
     via TEXT NOT NULL DEFAULT 'app',
     PRIMARY KEY (room_id, user_id)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_rm_user ON room_members (user_id, left_at)`,
  `CREATE TABLE IF NOT EXISTS auctions (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     room_id INTEGER NOT NULL, container_id INTEGER NOT NULL,
     status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'won', 'no_bids', 'cancelled')),
     initial_bid INTEGER NOT NULL, current_bid INTEGER NOT NULL, leader_id INTEGER, bids_count INTEGER NOT NULL DEFAULT 0,
     started_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, ended_at INTEGER,
     car_id INTEGER
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_auction_active ON auctions (room_id) WHERE status = 'active'`,
  `CREATE INDEX IF NOT EXISTS idx_auctions_due ON auctions (status, ends_at)`,
  `CREATE INDEX IF NOT EXISTS idx_auctions_room ON auctions (room_id, id)`,
  `CREATE TABLE IF NOT EXISTS bids (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     op_id TEXT NOT NULL UNIQUE, auction_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
     amount INTEGER NOT NULL CHECK (amount > 0), created_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_bids_auction ON bids (auction_id, id)`,
  ...immutable('bids'),
  // живые сообщения комнаты в чатах: бот перерисовывает их при каждом изменении
  `CREATE TABLE IF NOT EXISTS room_msgs (
     chat_id INTEGER NOT NULL, message_id INTEGER NOT NULL, room_id INTEGER NOT NULL, user_id INTEGER,
     shown_rev INTEGER NOT NULL DEFAULT -1, shown_at INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
     PRIMARY KEY (chat_id, message_id)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_room_msgs_room ON room_msgs (room_id, active)`,
  `CREATE TABLE IF NOT EXISTS groups (
     chat_id INTEGER PRIMARY KEY, title TEXT, username TEXT, is_active INTEGER NOT NULL DEFAULT 1,
     auction_enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL
   )`,
  // уведомления, которые бот должен отправить (победа, кик) — отправляются при ближайшем обращении
  `CREATE TABLE IF NOT EXISTS outbox (
     id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id INTEGER NOT NULL, kind TEXT NOT NULL, ref INTEGER,
     created_at INTEGER NOT NULL, sent_at INTEGER, claimed_at INTEGER
   )`,
  `CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox (sent_at, id)`,

  // ---------- экономика ----------
  `CREATE TABLE IF NOT EXISTS car_sales (    -- продажа машины государству
     user_car_id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, amount INTEGER NOT NULL, rate_bps INTEGER NOT NULL, created_at INTEGER NOT NULL
   )`,
  ...immutable('car_sales'),
  `CREATE TABLE IF NOT EXISTS sale_offers (  -- продажа машины другому игроку
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     seller_id INTEGER NOT NULL, buyer_id INTEGER NOT NULL, user_car_id INTEGER NOT NULL,
     price INTEGER NOT NULL CHECK (price > 0), rate_bps INTEGER NOT NULL,
     status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
     created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, resolved_at INTEGER
   )`,
  `CREATE INDEX IF NOT EXISTS idx_offers_buyer ON sale_offers (buyer_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_offers_car ON sale_offers (user_car_id, status)`,
  `CREATE TABLE IF NOT EXISTS transfers (
     id INTEGER PRIMARY KEY AUTOINCREMENT, op_id TEXT NOT NULL UNIQUE,
     from_id INTEGER NOT NULL, to_id INTEGER NOT NULL, amount INTEGER NOT NULL CHECK (amount > 0),
     commission INTEGER NOT NULL CHECK (commission >= 0), created_at INTEGER NOT NULL,
     CHECK (from_id <> to_id)
   )`,
  ...immutable('transfers'),
  `CREATE TABLE IF NOT EXISTS bonus_claims (user_id INTEGER NOT NULL, day INTEGER NOT NULL, amount INTEGER NOT NULL, PRIMARY KEY (user_id, day))`,
  ...immutable('bonus_claims'),
  `CREATE TABLE IF NOT EXISTS vip_grants (
     id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL UNIQUE,
     source TEXT NOT NULL CHECK (source IN ('purchase', 'admin', 'promo', 'shop', 'bp')),
     price INTEGER NOT NULL DEFAULT 0, granted_by INTEGER, created_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS garage_upgrades (
     user_id INTEGER NOT NULL, capacity INTEGER NOT NULL, price INTEGER NOT NULL, created_at INTEGER NOT NULL,
     PRIMARY KEY (user_id, capacity)
   )`,
  ...immutable('garage_upgrades'),
  `CREATE TABLE IF NOT EXISTS referrals (
     invited_id INTEGER PRIMARY KEY, inviter_id INTEGER NOT NULL, created_at INTEGER NOT NULL,
     first_purchase_paid INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE INDEX IF NOT EXISTS idx_referrals_inviter ON referrals (inviter_id)`,
  // выдача машины без аукциона (награды, админ): машину выбирает код, триггер проверяет и выдаёт
  `CREATE TABLE IF NOT EXISTS car_grants (
     id INTEGER PRIMARY KEY AUTOINCREMENT, op_id TEXT NOT NULL UNIQUE, user_id INTEGER NOT NULL, car_id INTEGER NOT NULL,
     source TEXT NOT NULL CHECK (source IN ('referral', 'admin', 'promo', 'shop', 'bp')), created_at INTEGER NOT NULL
   )`,
  ...immutable('car_grants'),
  // открытие контейнера из инвентаря
  `CREATE TABLE IF NOT EXISTS container_opens (
     id INTEGER PRIMARY KEY AUTOINCREMENT, op_id TEXT NOT NULL UNIQUE, user_id INTEGER NOT NULL,
     container_id INTEGER NOT NULL, car_id INTEGER NOT NULL, created_at INTEGER NOT NULL
   )`,
  ...immutable('container_opens'),
  // промокоды
  `CREATE TABLE IF NOT EXISTS promo_codes (
     code TEXT PRIMARY KEY CHECK (code = upper(code) AND length(code) BETWEEN 3 AND 32),
     money INTEGER NOT NULL DEFAULT 0 CHECK (money >= 0), container_id INTEGER, container_qty INTEGER NOT NULL DEFAULT 0,
     vip INTEGER NOT NULL DEFAULT 0, car_id INTEGER,
     max_uses INTEGER, uses INTEGER NOT NULL DEFAULT 0, expires_at INTEGER, is_active INTEGER NOT NULL DEFAULT 1,
     created_by INTEGER NOT NULL, created_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS promo_uses (code TEXT NOT NULL, user_id INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (code, user_id))`,
  ...immutable('promo_uses'),
  // магазин: лот = деньги и/или контейнеры, VIP (за игровые $)
  `CREATE TABLE IF NOT EXISTS shop_lots (
     id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT,
     price INTEGER NOT NULL CHECK (price > 0),
     money INTEGER NOT NULL DEFAULT 0, container_id INTEGER, container_qty INTEGER NOT NULL DEFAULT 0, car_id INTEGER, vip INTEGER NOT NULL DEFAULT 0,
     is_available INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0, per_user_limit INTEGER
   )`,
  `CREATE TABLE IF NOT EXISTS shop_purchases (
     id INTEGER PRIMARY KEY AUTOINCREMENT, op_id TEXT NOT NULL UNIQUE, user_id INTEGER NOT NULL, lot_id INTEGER NOT NULL,
     price INTEGER NOT NULL, car_id INTEGER, created_at INTEGER NOT NULL
   )`,
  ...immutable('shop_purchases'),
  // админ: корректировка баланса
  `CREATE TABLE IF NOT EXISTS admin_adjusts (
     id INTEGER PRIMARY KEY AUTOINCREMENT, op_id TEXT NOT NULL UNIQUE, admin_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
     delta INTEGER NOT NULL CHECK (delta <> 0), reason TEXT, created_at INTEGER NOT NULL
   )`,
  ...immutable('admin_adjusts'),
  `CREATE TABLE IF NOT EXISTS admin_log (
     id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id INTEGER NOT NULL, action TEXT NOT NULL, details TEXT, created_at INTEGER NOT NULL
   )`,
];

const triggers = [
  // ---------- регистрация: стартовый капитал и реферальные бонусы ----------
  `CREATE TRIGGER IF NOT EXISTS users_ai AFTER INSERT ON users WHEN NEW.id > 0 BEGIN
     UPDATE users SET garage_capacity = ${S('garage_start')} WHERE id = NEW.id;
     ${post("'start:' || NEW.id", 'NEW.id', 'start', S('start_balance'))}
     INSERT INTO referrals (invited_id, inviter_id, created_at)
       SELECT NEW.id, NEW.referred_by, ${NOW} WHERE NEW.referred_by IS NOT NULL;
   END`,
  `CREATE TRIGGER IF NOT EXISTS referrals_bi BEFORE INSERT ON referrals BEGIN
     SELECT RAISE(ABORT, 'BAD_REFERRAL') WHERE NEW.inviter_id = NEW.invited_id
       OR NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.inviter_id AND id > 0);
   END`,
  `CREATE TRIGGER IF NOT EXISTS referrals_ai AFTER INSERT ON referrals BEGIN
     ${post("'ref:' || NEW.invited_id", 'NEW.inviter_id', 'ref_inviter', S('ref_inviter'), 'NEW.invited_id')}
     ${post("'ref:' || NEW.invited_id", 'NEW.invited_id', 'ref_invited', S('ref_invited'), 'NEW.inviter_id')}
     UPDATE users SET referrals_count = referrals_count + 1 WHERE id = NEW.inviter_id;
   END`,
  // бонус пригласившему за первую покупку приглашённого (VIP, магазин, расширение гаража)
  `CREATE TRIGGER IF NOT EXISTS users_first_purchase AFTER UPDATE OF first_purchase_done ON users
     WHEN OLD.first_purchase_done = 0 AND NEW.first_purchase_done = 1 BEGIN
     ${post("'reffp:' || NEW.id", '(SELECT inviter_id FROM referrals WHERE invited_id = NEW.id)', 'ref_first_purchase',
      `CASE WHEN EXISTS (SELECT 1 FROM referrals WHERE invited_id = NEW.id) THEN ${S('ref_first_purchase')} ELSE 0 END`, 'NEW.id')}
     UPDATE referrals SET first_purchase_paid = 1 WHERE invited_id = NEW.id;
   END`,

  // ---------- аукцион: запуск контейнера ----------
  `CREATE TRIGGER IF NOT EXISTS auctions_bi BEFORE INSERT ON auctions BEGIN
     SELECT RAISE(ABORT, 'ROOM_CLOSED') WHERE (SELECT status FROM rooms WHERE id = NEW.room_id) IS NOT 'open'
       OR (SELECT stop_requested FROM rooms WHERE id = NEW.room_id) = 1;
     SELECT RAISE(ABORT, 'TOO_EARLY') WHERE (SELECT next_at FROM rooms WHERE id = NEW.room_id) > ${NOW};
     SELECT RAISE(ABORT, 'ROOM_EMPTY') WHERE ${ACTIVE_MEMBERS('NEW.room_id')} = 0;
     SELECT RAISE(ABORT, 'CONTAINER_UNAVAILABLE') WHERE NOT EXISTS (
       SELECT 1 FROM containers WHERE id = NEW.container_id AND is_enabled = 1 AND price = NEW.initial_bid)
       OR NOT EXISTS (SELECT 1 FROM container_cars cc JOIN cars c ON c.id = cc.car_id WHERE cc.container_id = NEW.container_id AND c.is_active = 1);
     SELECT RAISE(ABORT, 'BAD_AUCTION') WHERE NEW.status <> 'active' OR NEW.current_bid <> NEW.initial_bid
       OR NEW.leader_id IS NOT NULL OR NEW.bids_count <> 0 OR NEW.started_at <> ${NOW}
       OR NEW.ends_at <> ${NOW} + ${S('auction_timer_s')} OR NEW.car_id IS NOT NULL;
   END`,
  `CREATE TRIGGER IF NOT EXISTS auctions_ai AFTER INSERT ON auctions BEGIN
     UPDATE rooms SET rev = rev + 1 WHERE id = NEW.room_id;
   END`,

  // ---------- ставка: деньги сразу уходят в залог, перебитому — возврат ----------
  `CREATE TRIGGER IF NOT EXISTS bids_bi BEFORE INSERT ON bids BEGIN
     SELECT RAISE(ABORT, 'AUCTION_OVER') WHERE NOT EXISTS (
       SELECT 1 FROM auctions WHERE id = NEW.auction_id AND status = 'active' AND ends_at > ${NOW});
     SELECT RAISE(ABORT, 'NOT_IN_ROOM') WHERE NOT EXISTS (
       SELECT 1 FROM room_members m JOIN auctions a ON a.room_id = m.room_id
       WHERE a.id = NEW.auction_id AND m.user_id = NEW.user_id AND m.left_at IS NULL);
     SELECT RAISE(ABORT, 'USER_BANNED') WHERE (SELECT is_banned FROM users WHERE id = NEW.user_id) = 1;
     SELECT RAISE(ABORT, 'BID_TOO_LOW') WHERE NEW.amount < (SELECT current_bid FROM auctions WHERE id = NEW.auction_id) + ${S('bet_step')};
     SELECT RAISE(ABORT, 'BAD_BID') WHERE NEW.created_at <> ${NOW};
   END`,
  `CREATE TRIGGER IF NOT EXISTS bids_ai AFTER INSERT ON bids BEGIN
     -- новый лидер платит всю сумму; если лидер повышает свою ставку — только разницу
     ${post("'bid:' || NEW.id", 'NEW.user_id', 'bid',
      `-(NEW.amount - CASE WHEN (SELECT leader_id FROM auctions WHERE id = NEW.auction_id) = NEW.user_id
                         THEN (SELECT current_bid FROM auctions WHERE id = NEW.auction_id) ELSE 0 END)`, 'NEW.auction_id')}
     ${post("'bid:' || NEW.id", '(SELECT leader_id FROM auctions WHERE id = NEW.auction_id)', 'bid_refund',
      `CASE WHEN (SELECT leader_id FROM auctions WHERE id = NEW.auction_id) IS NOT NEW.user_id
            THEN (SELECT current_bid FROM auctions WHERE id = NEW.auction_id) ELSE 0 END`, 'NEW.auction_id')}
     UPDATE auctions SET current_bid = NEW.amount, leader_id = NEW.user_id, bids_count = bids_count + 1,
       ends_at = ${NOW} + ${S('auction_timer_s')} WHERE id = NEW.auction_id;
     UPDATE room_members SET missed = 0 WHERE user_id = NEW.user_id
       AND room_id = (SELECT room_id FROM auctions WHERE id = NEW.auction_id);
     UPDATE users SET bids_made = bids_made + 1 WHERE id = NEW.user_id;
     UPDATE rooms SET rev = rev + 1 WHERE id = (SELECT room_id FROM auctions WHERE id = NEW.auction_id);
   END`,

  // ---------- завершение контейнера ----------
  // Код выбирает машину (по шансам редкости и весам), триггер проверяет и выдаёт её.
  `CREATE TRIGGER IF NOT EXISTS auctions_bu BEFORE UPDATE ON auctions BEGIN
     SELECT RAISE(ABORT, 'IMMUTABLE') WHERE NEW.room_id <> OLD.room_id OR NEW.container_id <> OLD.container_id
       OR NEW.initial_bid <> OLD.initial_bid OR NEW.started_at <> OLD.started_at;
     SELECT RAISE(ABORT, 'AUCTION_OVER') WHERE OLD.status <> 'active';
     SELECT RAISE(ABORT, 'NOT_FINISHED') WHERE NEW.status IN ('won', 'no_bids') AND ${NOW} < OLD.ends_at;
     SELECT RAISE(ABORT, 'BAD_RESULT') WHERE NEW.status <> 'active' AND (
          NEW.ended_at IS NOT ${NOW} OR NEW.current_bid <> OLD.current_bid OR NEW.leader_id IS NOT OLD.leader_id
       OR (NEW.status = 'won' AND (OLD.leader_id IS NULL OR NEW.car_id IS NULL OR NOT ${IN_POOL('OLD.container_id', 'NEW.car_id')}))
       OR (NEW.status = 'no_bids' AND (OLD.leader_id IS NOT NULL OR NEW.car_id IS NOT NULL))
       OR (NEW.status = 'cancelled' AND NEW.car_id IS NOT NULL));
   END`,
  `CREATE TRIGGER IF NOT EXISTS auctions_done AFTER UPDATE OF status ON auctions WHEN OLD.status = 'active' AND NEW.status <> 'active' BEGIN
     -- победитель: машина в гараж (оплата — его последняя ставка, она уже в залоге)
     ${giveCar("'win:' || NEW.id", 'NEW.leader_id', 'NEW.car_id', 'auction', 'NEW.id', { paid: 'NEW.current_bid', when: "NEW.status = 'won'" })}
     UPDATE users SET containers_opened = containers_opened + 1, wins = wins + 1, spent_total = spent_total + NEW.current_bid
       WHERE NEW.status = 'won' AND id = NEW.leader_id;
     -- отменённый админом: залог возвращается
     ${post("'cancel:' || NEW.id", 'NEW.leader_id', 'bid_refund', `CASE WHEN NEW.status = 'cancelled' AND NEW.leader_id IS NOT NULL THEN NEW.current_bid ELSE 0 END`, 'NEW.id')}
     -- кто не ставил — пропуск; после kick_after пропусков подряд игрок выходит из комнаты
     UPDATE room_members SET missed = missed + 1
       WHERE room_id = NEW.room_id AND left_at IS NULL AND NEW.status <> 'cancelled'
         AND user_id NOT IN (SELECT user_id FROM bids WHERE auction_id = NEW.id);
     UPDATE room_members SET left_at = ${NOW}, kicked = 1
       WHERE room_id = NEW.room_id AND left_at IS NULL AND missed >= ${S('kick_after')};
     INSERT INTO outbox (chat_id, kind, ref, created_at)
       SELECT user_id, 'kicked', NEW.room_id, ${NOW} FROM room_members
       WHERE room_id = NEW.room_id AND kicked = 1 AND left_at = ${NOW} AND via = 'bot';
     INSERT INTO outbox (chat_id, kind, ref, created_at) SELECT NEW.leader_id, 'won', NEW.id, ${NOW} WHERE NEW.status = 'won';
     -- комната: пауза до следующего контейнера или закрытие, если никого не осталось
     UPDATE rooms SET next_at = ${NOW} + ${S('next_delay_s')}, rev = rev + 1,
       status = CASE WHEN ${ACTIVE_MEMBERS('NEW.room_id')} = 0 OR stop_requested = 1 THEN 'closed' ELSE status END,
       closed_at = CASE WHEN ${ACTIVE_MEMBERS('NEW.room_id')} = 0 OR stop_requested = 1 THEN ${NOW} ELSE closed_at END
       WHERE id = NEW.room_id;
   END`,

  // ---------- гараж ----------
  `CREATE TRIGGER IF NOT EXISTS user_cars_bi BEFORE INSERT ON user_cars BEGIN
     SELECT RAISE(ABORT, 'CAR_NOT_FOUND') WHERE NOT EXISTS (SELECT 1 FROM cars WHERE id = NEW.car_id);
   END`,
  `CREATE TRIGGER IF NOT EXISTS user_cars_bd BEFORE DELETE ON user_cars BEGIN SELECT RAISE(ABORT, 'IMMUTABLE'); END`,
  // машину можно только продать (государству или игроку); всё остальное неизменно
  `CREATE TRIGGER IF NOT EXISTS user_cars_bu BEFORE UPDATE ON user_cars BEGIN
     SELECT RAISE(ABORT, 'IMMUTABLE') WHERE NEW.car_id <> OLD.car_id OR NEW.obtained_at <> OLD.obtained_at OR NEW.source <> OLD.source;
     SELECT RAISE(ABORT, 'CAR_SOLD') WHERE OLD.status <> 'owned';
     SELECT RAISE(ABORT, 'BAD_CAR_UPDATE') WHERE NEW.user_id <> OLD.user_id AND NOT EXISTS (
       SELECT 1 FROM sale_offers WHERE user_car_id = OLD.id AND seller_id = OLD.user_id AND buyer_id = NEW.user_id
         AND status = 'accepted' AND resolved_at = ${NOW});
   END`,
  // продажа государству: сумма и комиссия проверяются здесь
  `CREATE TRIGGER IF NOT EXISTS car_sales_bi BEFORE INSERT ON car_sales BEGIN
     SELECT RAISE(ABORT, 'CAR_NOT_FOUND') WHERE NOT EXISTS (
       SELECT 1 FROM user_cars WHERE id = NEW.user_car_id AND user_id = NEW.user_id AND status = 'owned');
     SELECT RAISE(ABORT, 'BAD_SALE') WHERE NEW.created_at <> ${NOW} OR NEW.rate_bps <> ${SELL_RATE('NEW.user_car_id', 'NEW.user_id')}
       OR NEW.amount <> (SELECT c.price FROM user_cars u JOIN cars c ON c.id = u.car_id WHERE u.id = NEW.user_car_id) * (10000 - NEW.rate_bps) / 10000;
   END`,
  `CREATE TRIGGER IF NOT EXISTS car_sales_ai AFTER INSERT ON car_sales BEGIN
     UPDATE user_cars SET status = 'sold', sold_amount = NEW.amount, sold_at = ${NOW} WHERE id = NEW.user_car_id;
     ${post("'sell:' || NEW.user_car_id", 'NEW.user_id', 'sell_state', 'NEW.amount', 'NEW.user_car_id')}
     UPDATE users SET cars_sold = cars_sold + 1, earned_total = earned_total + NEW.amount WHERE id = NEW.user_id;
     UPDATE sale_offers SET status = 'cancelled', resolved_at = ${NOW} WHERE user_car_id = NEW.user_car_id AND status = 'pending';
   END`,
  // продажа игроку: предложение → принятие (деньги и машина меняются местами одной командой)
  `CREATE TRIGGER IF NOT EXISTS offers_bi BEFORE INSERT ON sale_offers BEGIN
     SELECT RAISE(ABORT, 'CAR_NOT_FOUND') WHERE NOT EXISTS (
       SELECT 1 FROM user_cars WHERE id = NEW.user_car_id AND user_id = NEW.seller_id AND status = 'owned');
     SELECT RAISE(ABORT, 'BUYER_NOT_FOUND') WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.buyer_id AND id > 0 AND is_banned = 0)
       OR NEW.buyer_id = NEW.seller_id;
     SELECT RAISE(ABORT, 'OFFER_EXISTS') WHERE EXISTS (SELECT 1 FROM sale_offers WHERE user_car_id = NEW.user_car_id AND status = 'pending' AND expires_at > ${NOW});
     SELECT RAISE(ABORT, 'BAD_OFFER') WHERE NEW.status <> 'pending' OR NEW.created_at <> ${NOW}
       OR NEW.expires_at <> ${NOW} + ${S('sale_offer_ttl_s')} OR NEW.rate_bps <> ${RATE('comm_player', 'NEW.seller_id')};
   END`,
  `CREATE TRIGGER IF NOT EXISTS offers_bu BEFORE UPDATE ON sale_offers BEGIN
     SELECT RAISE(ABORT, 'IMMUTABLE') WHERE NEW.seller_id <> OLD.seller_id OR NEW.buyer_id <> OLD.buyer_id
       OR NEW.user_car_id <> OLD.user_car_id OR NEW.price <> OLD.price OR NEW.rate_bps <> OLD.rate_bps;
     SELECT RAISE(ABORT, 'OFFER_CLOSED') WHERE OLD.status <> 'pending';
     SELECT RAISE(ABORT, 'OFFER_EXPIRED') WHERE NEW.status = 'accepted' AND OLD.expires_at <= ${NOW};
     SELECT RAISE(ABORT, 'CAR_NOT_FOUND') WHERE NEW.status = 'accepted' AND NOT EXISTS (
       SELECT 1 FROM user_cars WHERE id = OLD.user_car_id AND user_id = OLD.seller_id AND status = 'owned');
     SELECT RAISE(ABORT, 'GARAGE_FULL') WHERE NEW.status = 'accepted' AND ${OWNED('OLD.buyer_id')} >= ${CAPACITY('OLD.buyer_id')};
     SELECT RAISE(ABORT, 'BAD_OFFER') WHERE NEW.status <> 'pending' AND NEW.resolved_at IS NOT ${NOW};
   END`,
  `CREATE TRIGGER IF NOT EXISTS offers_accept AFTER UPDATE OF status ON sale_offers WHEN OLD.status = 'pending' AND NEW.status = 'accepted' BEGIN
     ${post("'offer:' || NEW.id", 'NEW.buyer_id', 'buy_car', '-NEW.price', 'NEW.user_car_id')}
     ${post("'offer:' || NEW.id", 'NEW.seller_id', 'sell_player', 'NEW.price * (10000 - NEW.rate_bps) / 10000', 'NEW.user_car_id')}
     UPDATE user_cars SET user_id = NEW.buyer_id, sold_to = NULL WHERE id = NEW.user_car_id;
     UPDATE users SET cars_sold = cars_sold + 1, earned_total = earned_total + NEW.price * (10000 - NEW.rate_bps) / 10000 WHERE id = NEW.seller_id;
     UPDATE users SET cars_obtained = cars_obtained + 1, spent_total = spent_total + NEW.price WHERE id = NEW.buyer_id;
   END`,

  // ---------- переводы ----------
  `CREATE TRIGGER IF NOT EXISTS transfers_bi BEFORE INSERT ON transfers BEGIN
     SELECT RAISE(ABORT, 'RECIPIENT_NOT_FOUND') WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.to_id AND id > 0);
     SELECT RAISE(ABORT, 'USER_BANNED') WHERE (SELECT is_banned FROM users WHERE id = NEW.from_id) = 1;
     SELECT RAISE(ABORT, 'BAD_AMOUNT') WHERE NEW.amount < ${S('min_transfer')};
     SELECT RAISE(ABORT, 'BAD_TRANSFER') WHERE NEW.created_at <> ${NOW}
       OR NEW.commission <> NEW.amount * ${RATE('comm_transfer', 'NEW.from_id')} / 10000;
   END`,
  `CREATE TRIGGER IF NOT EXISTS transfers_ai AFTER INSERT ON transfers BEGIN
     ${post("'tr:' || NEW.id", 'NEW.from_id', 'transfer_out', '-NEW.amount', 'NEW.to_id')}
     ${post("'tr:' || NEW.id", 'NEW.to_id', 'transfer_in', 'NEW.amount - NEW.commission', 'NEW.from_id')}
   END`,

  // ---------- ежедневный бонус ----------
  `CREATE TRIGGER IF NOT EXISTS bonus_bi BEFORE INSERT ON bonus_claims BEGIN
     SELECT RAISE(ABORT, 'BONUS_TAKEN') WHERE NEW.day <> ${DAY};
     SELECT RAISE(ABORT, 'BAD_BONUS') WHERE NEW.amount <> CASE WHEN (SELECT is_vip FROM users WHERE id = NEW.user_id) = 1
       THEN ${S('daily_bonus_vip')} ELSE ${S('daily_bonus')} END;
   END`,
  `CREATE TRIGGER IF NOT EXISTS bonus_ai AFTER INSERT ON bonus_claims BEGIN
     ${post("'bonus:' || NEW.day", 'NEW.user_id', 'daily_bonus', 'NEW.amount')}
     UPDATE users SET last_bonus_day = NEW.day WHERE id = NEW.user_id;
   END`,

  // ---------- VIP (навсегда) ----------
  `CREATE TRIGGER IF NOT EXISTS vip_bi BEFORE INSERT ON vip_grants BEGIN
     SELECT RAISE(ABORT, 'ALREADY_VIP') WHERE (SELECT is_vip FROM users WHERE id = NEW.user_id) = 1;
     SELECT RAISE(ABORT, 'BAD_VIP') WHERE (NEW.source = 'purchase' AND NEW.price <> ${S('vip_price')})
       OR (NEW.source <> 'purchase' AND NEW.price <> 0);
     SELECT RAISE(ABORT, 'NOT_ADMIN') WHERE NEW.source = 'admin' AND NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.granted_by AND is_admin = 1);
   END`,
  `CREATE TRIGGER IF NOT EXISTS vip_ai AFTER INSERT ON vip_grants BEGIN
     ${post("'vip:' || NEW.id", 'NEW.user_id', 'vip', '-NEW.price')}
     UPDATE users SET is_vip = 1, vip_since = ${NOW}, garage_capacity = garage_capacity + ${S('garage_vip_bonus')},
       first_purchase_done = CASE WHEN NEW.source = 'purchase' THEN 1 ELSE first_purchase_done END
       WHERE id = NEW.user_id;
   END`,
  // снять VIP может только админ (места в гараже остаются)
  `CREATE TRIGGER IF NOT EXISTS vip_bd BEFORE DELETE ON vip_grants BEGIN
     UPDATE users SET is_vip = 0 WHERE id = OLD.user_id;
   END`,

  // ---------- расширение гаража ----------
  `CREATE TRIGGER IF NOT EXISTS garage_up_bi BEFORE INSERT ON garage_upgrades BEGIN
     SELECT RAISE(ABORT, 'GARAGE_MAX') WHERE NEW.capacity > ${S('garage_max')} OR NEW.capacity IS NULL;
     SELECT RAISE(ABORT, 'BAD_TIER') WHERE NEW.capacity <> (SELECT min(capacity) FROM garage_tiers WHERE capacity > ${CAPACITY('NEW.user_id')} - CASE WHEN (SELECT is_vip FROM users WHERE id = NEW.user_id) = 1 THEN ${S('garage_vip_bonus')} ELSE 0 END)
       OR NEW.price <> (SELECT price FROM garage_tiers WHERE capacity = NEW.capacity) OR NEW.created_at <> ${NOW};
   END`,
  `CREATE TRIGGER IF NOT EXISTS garage_up_ai AFTER INSERT ON garage_upgrades BEGIN
     ${post("'garage:' || NEW.capacity", 'NEW.user_id', 'garage_upgrade', '-NEW.price')}
     UPDATE users SET garage_capacity = NEW.capacity + CASE WHEN is_vip = 1 THEN ${S('garage_vip_bonus')} ELSE 0 END,
       first_purchase_done = 1 WHERE id = NEW.user_id;
   END`,

  // ---------- выдача машин и открытие контейнеров ----------
  `CREATE TRIGGER IF NOT EXISTS car_grants_bi BEFORE INSERT ON car_grants BEGIN
     SELECT RAISE(ABORT, 'CAR_NOT_FOUND') WHERE NOT EXISTS (SELECT 1 FROM cars WHERE id = NEW.car_id);
     SELECT RAISE(ABORT, 'BAD_GRANT') WHERE NEW.source = 'referral' AND (
       (SELECT rarity FROM cars WHERE id = NEW.car_id) <> 'epic'
       OR (SELECT count(*) FROM car_grants WHERE user_id = NEW.user_id AND source = 'referral')
          >= (SELECT referrals_count FROM users WHERE id = NEW.user_id) / ${S('ref_epic_every')});
   END`,
  `CREATE TRIGGER IF NOT EXISTS car_grants_ai AFTER INSERT ON car_grants BEGIN
     ${giveCar("'grant:' || NEW.id", 'NEW.user_id', 'NEW.car_id', 'grant', 'NEW.id')}
   END`,
  `CREATE TRIGGER IF NOT EXISTS opens_bi BEFORE INSERT ON container_opens BEGIN
     SELECT RAISE(ABORT, 'NO_CONTAINER') WHERE COALESCE((SELECT qty FROM user_containers WHERE user_id = NEW.user_id AND container_id = NEW.container_id), 0) < 1;
     SELECT RAISE(ABORT, 'BAD_OPEN') WHERE NOT ${IN_POOL('NEW.container_id', 'NEW.car_id')} OR NEW.created_at <> ${NOW};
   END`,
  `CREATE TRIGGER IF NOT EXISTS opens_ai AFTER INSERT ON container_opens BEGIN
     UPDATE user_containers SET qty = qty - 1 WHERE user_id = NEW.user_id AND container_id = NEW.container_id;
     ${giveCar("'open:' || NEW.id", 'NEW.user_id', 'NEW.car_id', 'open', 'NEW.id')}
     UPDATE users SET containers_opened = containers_opened + 1 WHERE id = NEW.user_id;
   END`,

  // ---------- промокоды ----------
  `CREATE TRIGGER IF NOT EXISTS promo_use_bi BEFORE INSERT ON promo_uses BEGIN
     SELECT RAISE(ABORT, 'PROMO_NOT_FOUND') WHERE NOT EXISTS (SELECT 1 FROM promo_codes WHERE code = NEW.code AND is_active = 1);
     SELECT RAISE(ABORT, 'PROMO_EXPIRED') WHERE (SELECT expires_at FROM promo_codes WHERE code = NEW.code) <= ${NOW};
     SELECT RAISE(ABORT, 'PROMO_LIMIT') WHERE (SELECT max_uses IS NOT NULL AND uses >= max_uses FROM promo_codes WHERE code = NEW.code);
   END`,
  `CREATE TRIGGER IF NOT EXISTS promo_use_ai AFTER INSERT ON promo_uses BEGIN
     UPDATE promo_codes SET uses = uses + 1 WHERE code = NEW.code;
     ${post("'promo:' || NEW.code", 'NEW.user_id', 'promo', '(SELECT money FROM promo_codes WHERE code = NEW.code)')}
     INSERT INTO user_containers (user_id, container_id, qty)
       SELECT NEW.user_id, container_id, container_qty FROM promo_codes WHERE code = NEW.code AND container_id IS NOT NULL AND container_qty > 0
       ON CONFLICT (user_id, container_id) DO UPDATE SET qty = qty + excluded.qty;
     INSERT INTO vip_grants (user_id, source, price, created_at)
       SELECT NEW.user_id, 'promo', 0, ${NOW} FROM promo_codes WHERE code = NEW.code AND vip = 1
         AND (SELECT is_vip FROM users WHERE id = NEW.user_id) = 0;
     INSERT INTO car_grants (op_id, user_id, car_id, source, created_at)
       SELECT 'promo:' || NEW.code || ':' || NEW.user_id, NEW.user_id, car_id, 'promo', ${NOW} FROM promo_codes WHERE code = NEW.code AND car_id IS NOT NULL;
   END`,

  // ---------- магазин ----------
  `CREATE TRIGGER IF NOT EXISTS shop_bi BEFORE INSERT ON shop_purchases BEGIN
     SELECT RAISE(ABORT, 'SHOP_CLOSED') WHERE ${S('shop_enabled')} <> 1;
     SELECT RAISE(ABORT, 'ITEM_UNAVAILABLE') WHERE NOT EXISTS (SELECT 1 FROM shop_lots WHERE id = NEW.lot_id AND is_available = 1 AND price = NEW.price);
     SELECT RAISE(ABORT, 'LIMIT_REACHED') WHERE (SELECT per_user_limit FROM shop_lots WHERE id = NEW.lot_id) IS NOT NULL
       AND (SELECT count(*) FROM shop_purchases WHERE user_id = NEW.user_id AND lot_id = NEW.lot_id) >= (SELECT per_user_limit FROM shop_lots WHERE id = NEW.lot_id);
     SELECT RAISE(ABORT, 'ALREADY_VIP') WHERE (SELECT vip FROM shop_lots WHERE id = NEW.lot_id) = 1 AND (SELECT is_vip FROM users WHERE id = NEW.user_id) = 1;
     SELECT RAISE(ABORT, 'BAD_PURCHASE') WHERE NEW.created_at <> ${NOW} OR NEW.car_id IS NOT (SELECT car_id FROM shop_lots WHERE id = NEW.lot_id);
   END`,
  `CREATE TRIGGER IF NOT EXISTS shop_ai AFTER INSERT ON shop_purchases BEGIN
     ${post("'shop:' || NEW.id", 'NEW.user_id', 'shop', '-NEW.price', 'NEW.lot_id')}
     ${post("'shop:' || NEW.id", 'NEW.user_id', 'shop_money', '(SELECT money FROM shop_lots WHERE id = NEW.lot_id)', 'NEW.lot_id')}
     INSERT INTO user_containers (user_id, container_id, qty)
       SELECT NEW.user_id, container_id, container_qty FROM shop_lots WHERE id = NEW.lot_id AND container_id IS NOT NULL AND container_qty > 0
       ON CONFLICT (user_id, container_id) DO UPDATE SET qty = qty + excluded.qty;
     INSERT INTO vip_grants (user_id, source, price, created_at)
       SELECT NEW.user_id, 'shop', 0, ${NOW} FROM shop_lots WHERE id = NEW.lot_id AND vip = 1;
     INSERT INTO car_grants (op_id, user_id, car_id, source, created_at)
       SELECT 'shop:' || NEW.id, NEW.user_id, NEW.car_id, 'shop', ${NOW} WHERE NEW.car_id IS NOT NULL;
     UPDATE users SET first_purchase_done = 1 WHERE id = NEW.user_id;
   END`,

  // ---------- админ ----------
  `CREATE TRIGGER IF NOT EXISTS adjust_bi BEFORE INSERT ON admin_adjusts BEGIN
     SELECT RAISE(ABORT, 'NOT_ADMIN') WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.admin_id AND is_admin = 1);
     SELECT RAISE(ABORT, 'USER_NOT_FOUND') WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id AND id > 0);
   END`,
  `CREATE TRIGGER IF NOT EXISTS adjust_ai AFTER INSERT ON admin_adjusts BEGIN
     ${post("'adj:' || NEW.id", 'NEW.user_id', 'admin_adjust', 'NEW.delta', 'NEW.admin_id')}
     INSERT INTO admin_log (admin_id, action, details, created_at)
       VALUES (NEW.admin_id, 'adjust', NEW.user_id || ' ' || NEW.delta || ' ' || COALESCE(NEW.reason, ''), ${NOW});
   END`,
];

function seed() {
  const out = Object.entries(SETTINGS).map(([k, v]) => `INSERT INTO settings (k, v) VALUES ('${k}', ${v}) ON CONFLICT (k) DO NOTHING`);
  for (const [cap, price] of GARAGE_TIERS) out.push(`INSERT INTO garage_tiers (capacity, price) VALUES (${cap}, ${price}) ON CONFLICT DO NOTHING`);
  const q = (s) => (s == null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`);
  CONTAINERS.forEach((c, i) => {
    out.push(`INSERT INTO containers (id, name, country, emoji, price) VALUES (${i + 1}, ${q(c.name)}, ${q(c.country)}, ${q(c.emoji)}, ${c.price}) ON CONFLICT (id) DO NOTHING`);
  });
  CATALOG.forEach((c, i) => {
    out.push(`INSERT INTO cars (id, name, country, rarity, max_speed, accel_x100, power, handling, reliability, price, color, body)
      VALUES (${i + 1}, ${q(c.name)}, ${q(c.country)}, '${c.rarity}', ${c.speed}, ${Math.round(c.accel * 100)}, ${c.power}, ${c.handling}, ${c.reliability}, ${c.price}, ${q(c.color)}, ${q(c.body)})
      ON CONFLICT (id) DO NOTHING`);
    out.push(`INSERT INTO container_cars (container_id, car_id, weight) VALUES (${c.container}, ${i + 1}, 1) ON CONFLICT DO NOTHING`);
  });
  return out;
}

// Миграция 2: вымышленные марки вместо реальных (если админ не переименовал машину)
// и картинки в живых сообщениях комнат.
function migration2() {
  const q = (x) => `'${String(x).replace(/'/g, "''")}'`;
  const out = CATALOG.map((c, i) => `UPDATE cars SET name = ${q(c.name)}, body = ${q(c.body)} WHERE id = ${i + 1} AND name = ${q(c.legacy)}`);
  out.push('ALTER TABLE room_msgs ADD COLUMN media TEXT'); // последним: ALTER не идемпотентен
  return out;
}

export const MIGRATIONS = [
  { id: 1, statements: [...schema, ...triggers, ...seed()] },
  { id: 2, statements: migration2() },
  { id: 3, statements: MIGRATION_3 },
  { id: 4, statements: MIGRATION_4 },
  { id: 5, statements: MIGRATION_5 },
  // 6: цены расширения гаража — шаг $25 000.
  { id: 6, statements: GARAGE_TIERS.map(([c, p]) => `INSERT INTO garage_tiers (capacity, price) VALUES (${c}, ${p}) ON CONFLICT (capacity) DO UPDATE SET price = excluded.price`) },
  // 7: покупки за Stars, сообщения о проблемах и идеях, кик после 2 пропусков.
  { id: 7, statements: MIGRATION_7 },
  { id: 8, statements: MIGRATION_8 },
  // 9: VIP и Battle Pass только за звёзды, делюкс, покупка уровней, 15 уровней, машина сезона.
  { id: 9, statements: MIGRATION_9 },
  // 10: VIP 149⭐; премиум — эпическая машина, легендарная только в делюксе.
  { id: 10, statements: MIGRATION_10 },
  // 11: фоны и рамки профиля; эпическая машина за каждых 5 друзей.
  { id: 11, statements: MIGRATION_11 },
  // 12: немецкий контейнер — 50 узнаваемых машин.
  { id: 12, statements: MIGRATION_12 },
  // 13: немецкий контейнер — современные популярные модели.
  { id: 13, statements: MIGRATION_13 },
  // 14: цены обычных немецких машин вокруг цены контейнера.
  { id: 14, statements: MIGRATION_14 },
  // 15: немецкий контейнер под 3D-рендер.
  { id: 15, statements: MIGRATION_15 },
  // 16: японский контейнер — 50 машин.
  { id: 16, statements: MIGRATION_16 },
  // 17: американский контейнер — 50 машин.
  { id: 17, statements: MIGRATION_17 },
  // 18: французский контейнер — 50 машин.
  { id: 18, statements: MIGRATION_18 },
];
