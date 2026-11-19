// Аукцион в Mini App: состояние комнаты (опрос раз в секунду), вход, выход, ставка.
// Ставка отсюда сразу видна в сообщениях бота этой комнаты, и наоборот.
import { endpoint } from '../lib/endpoint.js';
import { joinRoom, leaveRoom, bid, myRoom, GameError, idOf } from '../lib/engine.js';
import { roomView } from '../lib/views.js';

function scopeOf(input) {
  const g = /^g(\d+)$/.exec(String(input.scope ?? ''));
  return g ? { scope: 'group', scopeId: -Number(g[1]) } : { scope: 'global', scopeId: 0 };
}

export default endpoint(async (db, uid, input) => {
  const sc = scopeOf(input);
  const action = input.action ?? 'state';
  if (action === 'join') {
    const roomId = await joinRoom(db, uid, { ...sc, via: 'app' });
    return { room: await roomView(db, roomId, uid), __room: roomId };
  }
  if (action === 'leave') {
    const id = idOf(input.roomId);
    await leaveRoom(db, uid, id);
    return { room: null, __room: id };
  }
  if (action === 'bid') {
    const id = input.roomId ? idOf(input.roomId) : (await myRoom(db, uid, sc))?.id;
    if (!id) throw new GameError('NOT_IN_ROOM');
    await bid(db, uid, id, { raise: input.raise ?? null, amount: input.amount ?? null, opId: String(input.clientId ?? '') });
    return { room: await roomView(db, id, uid), __room: id };
  }
  if (action === 'state') {
    const id = input.roomId ? idOf(input.roomId) : (await myRoom(db, uid, sc))?.id;
    if (!id) return { room: null };
    const v = await roomView(db, id, uid);
    if (!v) throw new GameError('ROOM_NOT_FOUND');
    return { room: v };
  }
  throw new GameError('BAD_INPUT');
});
