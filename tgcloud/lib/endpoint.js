// lib/endpoint.js — общая обёртка для endpoints Mini App: регистрация игрока,
// синхронизация времени и сообщений бота, перевод ошибок в коды.
import { db, api, InputFile, EndpointError } from 'sdk';
import { ensureUser, getUser, toGameError, GameError } from './engine.js';
import { sync } from './live.js';
import { ADMIN_IDS } from './config.js';

export function endpoint(fn, { admin = false } = {}) {
  return async function (input, ctx) {
    try {
      const tg = ctx.initData?.user;
      const sp = String(ctx.initData?.start_param ?? '');
      const ref = /^ref_?(\d+)$/.exec(sp)?.[1] ?? null;
      const uid = await ensureUser(db, tg, { admin: ADMIN_IDS.includes(Number(tg?.id)), ref });
      const u = await getUser(db, uid);
      if (u.is_banned) throw new GameError('USER_BANNED');
      if (admin && !u.is_admin) throw new GameError('NOT_ADMIN');
      await sync(db, api, InputFile, { limit: 2 });
      const res = await fn(db, uid, input ?? {}, { ctx, user: u, api, InputFile });
      // после действия игрока сообщения его комнаты в чатах обновляются сразу
      if (res && res.__room) { await sync(db, api, InputFile, { roomId: res.__room, limit: 2 }); delete res.__room; }
      return res;
    } catch (e) {
      const ge = toGameError(e);
      if (ge) throw new EndpointError(ge.code, { code: ge.code });
      throw e;
    }
  };
}
