// Профили игроков (свой и чужие), друзья, навык гонщика, цены контейнеров.
import { endpoint } from '../lib/endpoint.js';
import { GameError } from '../lib/engine.js';
import { playerView, addFriend, removeFriend, friendsView, skillView, buySkill, containerPrices, userSettings, saveUserSettings } from '../lib/engine3.js';

export default endpoint(async (db, uid, input) => {
  const a = input.action ?? 'get';
  if (a === 'get') return playerView(db, uid, input.id ?? uid);
  if (a === 'friends') return friendsView(db, uid);
  if (a === 'add_friend') { const f = await addFriend(db, uid, input.id != null ? Number(input.id) : input.ref); return { id: f.id }; }
  if (a === 'remove_friend') { await removeFriend(db, uid, input.id); return { ok: true }; }
  if (a === 'skill') return skillView(db, uid);
  if (a === 'buy_skill') return buySkill(db, uid, input.count, String(input.clientId ?? ''));
  if (a === 'prices') return { containers: await containerPrices(db) };
  if (a === 'settings') return userSettings(db, uid);
  if (a === 'save_settings') return saveUserSettings(db, uid, input.settings);
  throw new GameError('BAD_INPUT');
});
