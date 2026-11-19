// Рынок машин: витрина, выставить машину, снять, купить.
import { endpoint } from '../lib/endpoint.js';
import { GameError } from '../lib/engine.js';
import { marketView, listCar, unlistCar, buyListing } from '../lib/engine3.js';

export default endpoint(async (db, uid, input) => {
  const a = input.action ?? 'list';
  if (a === 'list') return marketView(db, uid, { rarity: input.rarity || null, country: input.country || null, sort: input.sort, mine: !!input.mine });
  if (a === 'sell') return listCar(db, uid, input.userCarId, input.price);
  if (a === 'unlist') { await unlistCar(db, uid, input.listingId); return { ok: true }; }
  if (a === 'buy') return { bought: await buyListing(db, uid, input.listingId) };
  throw new GameError('BAD_INPUT');
});
