// Гонки: заезд против бота, вызовы другим игрокам, принятие вызова, отмена.
import { endpoint } from '../lib/endpoint.js';
import { GameError } from '../lib/engine.js';
import { racesView, raceBot, raceCreate, raceAccept, raceCancel } from '../lib/engine3.js';

export default endpoint(async (db, uid, input) => {
  const a = input.action ?? 'list';
  const opId = String(input.clientId ?? '');
  if (a === 'list') return racesView(db, uid);
  if (a === 'bot') return { race: await raceBot(db, uid, { carId: input.carId, track: input.track, stake: input.stake, opId }) };
  if (a === 'create') return { race: await raceCreate(db, uid, { carId: input.carId, track: input.track, stake: input.stake, opId }) };
  if (a === 'accept') return { race: await raceAccept(db, uid, input.raceId, input.carId) };
  if (a === 'cancel') { await raceCancel(db, uid, input.raceId); return { ok: true }; }
  throw new GameError('BAD_INPUT');
});
