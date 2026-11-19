// Магазин и каталог: лоты, VIP, расширение гаража, шансы и состав контейнеров, лидеры.
import { endpoint } from '../lib/endpoint.js';
import { buyLot, settings, getUser, nextTier, GameError, idOf } from '../lib/engine.js';
import { catalogView, topView } from '../lib/views.js';

export default endpoint(async (db, uid, input) => {
  const a = input.action ?? 'list';
  if (a === 'catalog') return catalogView(db);
  if (a === 'top') return { kind: input.kind ?? 'balance', list: await topView(db, input.kind) };
  if (a === 'buy') return { bought: await buyLot(db, uid, idOf(input.id), String(input.clientId ?? '')) };
  if (a === 'list') {
    const st = await settings(db);
    const u = await getUser(db, uid);
    const lots = await db.all(
      `SELECT l.*, c.name AS container_name, c.emoji AS container_emoji, car.name AS car_name, car.rarity AS car_rarity,
              (SELECT count(*) FROM shop_purchases WHERE lot_id = l.id AND user_id = :u) AS bought
       FROM shop_lots l LEFT JOIN containers c ON c.id = l.container_id LEFT JOIN cars car ON car.id = l.car_id
       WHERE l.is_available = 1 ORDER BY l.sort, l.id`, { ':u': uid });
    return { enabled: st.shop_enabled === 1, lots, vip: { price: st.vip_price, owned: u.is_vip === 1, bonus_slots: st.garage_vip_bonus }, tier: await nextTier(db, u), balance: u.balance };
  }
  throw new GameError('BAD_INPUT');
});
