// Battle Pass: уровни, покупка премиума, получение наград.
import { endpoint } from '../lib/endpoint.js';
import { GameError } from '../lib/engine.js';
import { bpView, bpBuy, bpClaim } from '../lib/engine3.js';

export default endpoint(async (db, uid, input) => {
  const a = input.action ?? 'get';
  if (a === 'get') return bpView(db, uid);
  if (a === 'buy') { await bpBuy(db, uid); return bpView(db, uid); }
  if (a === 'claim') return { reward: await bpClaim(db, uid, input.level, input.track), bp: await bpView(db, uid) };
  throw new GameError('BAD_INPUT');
});
