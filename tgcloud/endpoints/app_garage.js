// Гараж: машины, продажа, предложения игрокам, контейнеры из инвентаря, расширение.
import { endpoint } from '../lib/endpoint.js';
import { sellCar, offerCar, answerOffer, openContainer, upgradeGarage, GameError, idOf } from '../lib/engine.js';
import { garageView, carView } from '../lib/views.js';

export default endpoint(async (db, uid, input) => {
  const a = input.action ?? 'list';
  if (a === 'list') return garageView(db, uid, { page: Number(input.page) || 1, rarity: input.rarity || null });
  if (a === 'car') {
    const c = await carView(db, uid, idOf(input.id));
    if (!c) throw new GameError('CAR_NOT_FOUND');
    return c;
  }
  if (a === 'sell') return { sold: await sellCar(db, uid, idOf(input.id)) };
  if (a === 'offer') return { offer: await offerCar(db, uid, idOf(input.id), input.to, input.price) };
  if (a === 'answer') return { offer: await answerOffer(db, uid, idOf(input.id), !!input.accept) };
  if (a === 'open') {
    const o = await openContainer(db, uid, idOf(input.id), String(input.clientId ?? ''));
    const uc = await db.get(`SELECT id, status, sold_amount FROM user_cars WHERE source = 'open' AND source_ref = :i`, { ':i': o.id });
    const car = await db.get('SELECT * FROM cars WHERE id = :c', { ':c': o.car_id });
    return { car, user_car_id: uc?.id, auto_sold: uc?.status === 'sold' ? uc.sold_amount : null };
  }
  if (a === 'upgrade') return { tier: await upgradeGarage(db, uid) };
  throw new GameError('BAD_INPUT');
});
