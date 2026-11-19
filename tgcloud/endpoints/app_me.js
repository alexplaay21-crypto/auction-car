// Профиль и действия игрока: бонус, VIP, перевод, промокод, история операций.
import { endpoint } from '../lib/endpoint.js';
import { claimBonus, buyVip, transfer, redeemPromo, referralRewards, myRoom, GameError } from '../lib/engine.js';
import { profileView } from '../lib/views.js';
import { BOT_USERNAME } from '../lib/config.js';
import { userSettings } from '../lib/engine3.js';

export default endpoint(async (db, uid, input) => {
  const a = input.action ?? 'get';
  let result = null;
  if (a === 'bonus') result = await claimBonus(db, uid);
  else if (a === 'vip') result = { price: await buyVip(db, uid) };
  else if (a === 'transfer') result = await transfer(db, uid, input.to, input.amount, String(input.clientId ?? ''));
  else if (a === 'promo') result = await redeemPromo(db, uid, input.code);
  else if (a === 'history') {
    return { items: await db.all('SELECT kind, delta, balance_after, ref, created_at FROM ledger WHERE user_id = :u ORDER BY id DESC LIMIT 50', { ':u': uid }) };
  } else if (a === 'referrals') {
    await referralRewards(db, uid).catch(() => 0);
    const list = await db.all(
      `SELECT u.id, u.username, u.first_name, u.photo_url, r.created_at FROM referrals r JOIN users u ON u.id = r.invited_id
       WHERE r.inviter_id = :u ORDER BY r.created_at DESC LIMIT 100`, { ':u': uid });
    return { list, link: `https://t.me/${BOT_USERNAME}?start=ref_${uid}`, app_link: `https://t.me/${BOT_USERNAME}?startapp=ref_${uid}` };
  } else if (a !== 'get') throw new GameError('BAD_INPUT');
  const room = await myRoom(db, uid);
  return { ...(await profileView(db, uid)), room_id: room?.id ?? null, settings: await userSettings(db, uid), result };
});
