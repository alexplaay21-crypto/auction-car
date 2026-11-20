// Гонки: игрок сам ведёт машину. start — ставка в залог и трасса, finish — нажатия на проверку
// (сервер пересчитывает заезд и сам определяет время), replay — повтор из истории, cancel — отмена вызова.
import { endpoint } from '../lib/endpoint.js';
import { GameError } from '../lib/engine.js';
import { racesView, raceCancel } from '../lib/engine3.js';
import { driveStart, driveFinish, driveSweep, raceReplay } from '../lib/engine_drive.js';

export default endpoint(async (db, uid, input) => {
  const a = input.action ?? 'list';
  const opId = String(input.clientId ?? '');
  if (a === 'list') { await driveSweep(db, uid); return racesView(db, uid); }
  if (a === 'start') return { drive: await driveStart(db, uid, { mode: input.mode, carId: input.carId, track: input.track, stake: input.stake, raceId: input.raceId, opId }) };
  if (a === 'finish') return driveFinish(db, uid, { driveId: input.driveId, inputs: input.inputs });
  if (a === 'replay') return raceReplay(db, input.raceId);
  if (a === 'cancel') { await raceCancel(db, uid, input.raceId); return { ok: true }; }
  throw new GameError('BAD_INPUT');
});
