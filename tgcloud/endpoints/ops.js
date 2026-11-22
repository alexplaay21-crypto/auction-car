// endpoints/ops.js — служебные команды из консоли (tgcloud run, ctx user 777000):
// миграции, проверка целостности, настройка бота.
import { db, api, EndpointError } from 'sdk';
import { migrate, audit } from '../lib/engine.js';
import { OPERATOR_ID, MINI_APP_URL, APP_NAME } from '../lib/config.js';

export default async function (input, ctx) {
  if (Number(ctx.initData?.user?.id) !== OPERATOR_ID) throw new EndpointError('Forbidden', { code: 'FORBIDDEN' });
  switch (input?.action) {
    case 'migrate': return { applied: await migrate(db) };
    case 'audit': return { problems: await audit(db) };
    // экономика (только чтение): деньги у игроков, источники и стоки по журналу, пакеты за звёзды
    case 'econ': {
      const t = (await db.get('SELECT now FROM v_now')).now;
      const users = await db.get('SELECT count(*) AS n, sum(balance) AS total, avg(balance) AS avg FROM users WHERE id > 0');
      const pct = async (p) => (await db.get('SELECT balance FROM users WHERE id > 0 ORDER BY balance LIMIT 1 OFFSET :o', { ':o': Math.floor((users.n - 1) * p) }))?.balance;
      const active7 = await db.get('SELECT count(DISTINCT user_id) AS n FROM ledger WHERE created_at > :t', { ':t': t - 7 * 86400 });
      const by = async (since) => db.all(`SELECT kind, count(*) AS n, sum(delta) AS sum FROM ledger WHERE user_id > 0 AND created_at > :s GROUP BY kind ORDER BY sum DESC`, { ':s': since });
      return {
        users: { ...users, p50: await pct(0.5), p90: await pct(0.9), p99: await pct(0.99), active7: active7.n },
        top: await db.all('SELECT id, balance FROM users WHERE id > 0 ORDER BY balance DESC LIMIT 10'),
        garage: await db.get("SELECT count(*) AS cars, sum(c.price) AS value FROM user_cars uc JOIN cars c ON c.id = uc.car_id WHERE uc.status = 'owned' AND uc.user_id > 0"),
        ledger_all: await by(0), ledger_7d: await by(t - 7 * 86400),
        stars: await db.all('SELECT * FROM star_products ORDER BY sort, id'),
        star_paid: await db.all('SELECT product_id, count(*) AS n, sum(stars) AS stars FROM star_payments GROUP BY product_id').catch((e) => String(e?.message)),
        settings: await db.all("SELECT k, v FROM settings WHERE k LIKE '%bonus%' OR k LIKE 'ref_%' OR k LIKE 'race%' OR k LIKE 'start%' OR k LIKE 'comm_%' OR k IN ('bet_step', 'vip_price', 'bp_price')"),
        containers: await db.all('SELECT id, name, price, is_enabled FROM containers ORDER BY id'),
        auctions_7d: await db.get("SELECT count(*) AS n, avg(current_bid) AS avg_win, sum(current_bid) AS spent FROM auctions WHERE status = 'won' AND ended_at > :t", { ':t': t - 7 * 86400 }),
      };
    }
    case 'setup_bot':
      await api.setMyCommands({ commands: [
        { command: 'play', description: 'Играть — войти в комнату аукциона' },
        { command: 'bet', description: 'Ставка: /bet 7500' },
        { command: 'garage', description: 'Мой гараж' },
        { command: 'profile', description: 'Профиль и статистика' },
        { command: 'bonus', description: 'Ежедневный бонус' },
        { command: 'top', description: 'Лидеры' },
        { command: 'help', description: 'Как играть' },
      ] });
      await api.setChatMenuButton({ menu_button: { type: 'web_app', text: 'Играть', web_app: { url: MINI_APP_URL } } });
      await api.setMyDescription({ description: `${APP_NAME} — аукцион контейнеров с машинами. Делай ставки, собирай гараж, продавай машины. Играй в боте или в приложении — это одна игра.` });
      await api.setMyShortDescription({ short_description: 'Аукцион контейнеров с машинами: ставки, гараж, VIP' });
      return { ok: true };
    // Переезд с Bina Play на этом же боте: резервная копия и удаление старых таблиц.
    // Запускается только явно (confirm) и только пока таблиц аукциона ещё нет.
    case 'legacy_dump': {
      const out = {};
      for (const t of ['users', 'wallets', 'star_payments', 'tokens', 'token_holders', 'vip_purchases']) {
        out[t] = await db.all(`SELECT * FROM ${t} LIMIT 5000`).catch((e) => ({ error: String(e?.message ?? e) }));
      }
      return out;
    }
    case 'wipe_legacy': {
      if (input.confirm !== 'WIPE_BINA') throw new EndpointError('Confirm required', { code: 'CONFIRM' });
      const has = async (name) => !!(await db.get(`SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = :n`, { ':n': name }).catch(() => null));
      if (await has('auctions')) throw new EndpointError('Auction tables already exist', { code: 'ALREADY_MIGRATED' });
      if (!(await has('tokens'))) throw new EndpointError('Not a Bina database', { code: 'NOT_BINA' });
      const objs = await db.all(`SELECT type, name FROM sqlite_master WHERE type IN ('view', 'table') AND name NOT LIKE 'sqlite_%'`);
      const dropped = [];
      for (const o of objs.filter((x) => x.type === 'view')) { await db.run(`DROP VIEW IF EXISTS "${o.name}"`); dropped.push(o.name); }
      for (const o of objs.filter((x) => x.type === 'table')) { await db.run(`DROP TABLE IF EXISTS "${o.name}"`); dropped.push(o.name); }
      return { dropped };
    }
    // Полный сброс игры: удаляются все таблицы, затем база создаётся заново миграциями.
    case 'dump_users':
      return { users: await db.all('SELECT id, username, first_name, balance, is_vip, created_at FROM users ORDER BY id') };
    case 'reset_all': {
      if (input.confirm !== 'RESET_ALL') throw new EndpointError('Confirm required', { code: 'CONFIRM' });
      const objs = await db.all(`SELECT type, name FROM sqlite_master WHERE type IN ('view', 'table') AND name NOT LIKE 'sqlite_%'`);
      for (const o of objs.filter((x) => x.type === 'view')) await db.run(`DROP VIEW IF EXISTS "${o.name}"`);
      for (const o of objs.filter((x) => x.type === 'table')) await db.run(`DROP TABLE IF EXISTS "${o.name}"`);
      return { dropped: objs.length, applied: await migrate(db) };
    }
    case 'stats':
      return {
        users: (await db.get('SELECT count(*) AS n FROM users WHERE id > 0')).n,
        rooms: await db.all(`SELECT id, scope, scope_id, number, status, rev FROM rooms ORDER BY id DESC LIMIT 5`),
        msgs: await db.all('SELECT * FROM room_msgs ORDER BY shown_at DESC LIMIT 5'),
      };
    default: throw new EndpointError('Unknown action', { code: 'BAD_INPUT' });
  }
}
