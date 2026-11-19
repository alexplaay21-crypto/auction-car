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
    case 'stats':
      return {
        users: (await db.get('SELECT count(*) AS n FROM users WHERE id > 0')).n,
        rooms: await db.all(`SELECT id, scope, scope_id, number, status, rev FROM rooms ORDER BY id DESC LIMIT 5`),
        msgs: await db.all('SELECT * FROM room_msgs ORDER BY shown_at DESC LIMIT 5'),
      };
    default: throw new EndpointError('Unknown action', { code: 'BAD_INPUT' });
  }
}
