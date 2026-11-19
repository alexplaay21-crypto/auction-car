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
    case 'stats':
      return {
        users: (await db.get('SELECT count(*) AS n FROM users WHERE id > 0')).n,
        rooms: await db.all(`SELECT id, scope, scope_id, number, status, rev FROM rooms ORDER BY id DESC LIMIT 5`),
        msgs: await db.all('SELECT * FROM room_msgs ORDER BY shown_at DESC LIMIT 5'),
      };
    default: throw new EndpointError('Unknown action', { code: 'BAD_INPUT' });
  }
}
