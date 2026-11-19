// handlers/callback_query.js — кнопки бота.
//   b:<комната>:<прибавка>  ставка (в группе — сразу вход в комнату)
//   j:<chat id>             войти в комнату группы
//   l:<комната>             выйти из комнаты
//   c:<машина> / s:<машина> карточка машины / продать
//   gp:<стр> гараж, oc:<контейнер> открыть, gup расширить гараж
//   oa:/od:<предложение>    купить / отказаться
//   bonus, vip, buy:<лот>, top:<вид>
import { api, db, InputFile } from 'sdk';
import { ensureUser, joinRoom, leaveRoom, bid, sellCar, openContainer, upgradeGarage, answerOffer, claimBonus, buyVip, buyLot, toGameError, getUser } from '../lib/engine.js';
import { sync, sendCar } from '../lib/live.js';
import { money, carCardText, RARITY } from '../lib/views.js';
import { errText } from '../lib/texts.js';
import { garageScreen, carScreen, topScreen, shopScreen, profileScreen } from '../lib/botui.js';
import { ADMIN_IDS } from '../lib/config.js';

const answer = (q, text, alert = false) => api.answerCallbackQuery({ callback_query_id: q.id, text, show_alert: alert }).catch(() => {});

async function editScreen(q, screen) {
  const msg = q.message;
  if (!msg) return;
  const params = { chat_id: msg.chat.id, message_id: msg.message_id, parse_mode: 'HTML', reply_markup: screen.reply_markup };
  try {
    if (msg.photo) await api.editMessageCaption({ ...params, caption: screen.text });
    else await api.editMessageText({ ...params, text: screen.text });
  } catch (e) {
    if (!/not modified/i.test(String(e?.description ?? ''))) {
      await api.sendMessage({ chat_id: msg.chat.id, text: screen.text, parse_mode: 'HTML', reply_markup: screen.reply_markup });
    }
  }
}

export default async function (q) {
  const data = String(q.data ?? '');
  const [kind, x, y] = data.split(':');
  const uid = await ensureUser(db, q.from, { admin: ADMIN_IDS.includes(Number(q.from?.id)) });
  const u = await getUser(db, uid);
  if (u.is_banned) return answer(q, '⛔ Аккаунт заблокирован', true);
  const chat = q.message?.chat;
  const isGroup = chat && (chat.type === 'group' || chat.type === 'supergroup');
  let roomTouched = null;
  try {
    if (kind === 'b') {
      const roomId = Number(x), raise = Number(y);
      const room = await db.get('SELECT * FROM rooms WHERE id = :r', { ':r': roomId });
      if (room?.scope === 'group') {
        const mine = await db.get('SELECT 1 FROM room_members WHERE room_id = :r AND user_id = :u AND left_at IS NULL', { ':r': roomId, ':u': uid });
        if (!mine) await joinRoom(db, uid, { scope: 'group', scopeId: room.scope_id, via: 'bot' });
      }
      const r = await bid(db, uid, roomId, { raise, opId: `cb${q.id}` });
      roomTouched = roomId;
      await answer(q, `✅ Твоя ставка ${money(r.auction.current_bid)}`);
    } else if (kind === 'j') {
      const roomId = await joinRoom(db, uid, { scope: 'group', scopeId: Number(x), via: 'bot' });
      roomTouched = roomId;
      await answer(q, '🎮 Ты в игре! Ставь кнопками под сообщением.');
    } else if (kind === 'l') {
      await leaveRoom(db, uid, Number(x));
      roomTouched = Number(x);
      await answer(q, '🚪 Ты вышел из комнаты');
    } else if (kind === 'gp') {
      await answer(q);
      await editScreen(q, await garageScreen(db, uid, Number(x) || 1));
    } else if (kind === 'c') {
      await answer(q);
      const s = await carScreen(db, uid, Number(x));
      if (!s) return answer(q, 'Машина не найдена', true);
      await editScreen(q, s);
    } else if (kind === 's') {
      const sold = await sellCar(db, uid, Number(x));
      await answer(q, `💰 Продано за ${money(sold.amount)}`, true);
      if (q.message) {
        const caption = `✅ Машина продана за <b>${money(sold.amount)}</b> (комиссия ${sold.rate / 100}%).`;
        if (q.message.photo) await api.editMessageCaption({ chat_id: chat.id, message_id: q.message.message_id, caption, parse_mode: 'HTML' }).catch(() => {});
        else await api.editMessageText({ chat_id: chat.id, message_id: q.message.message_id, text: caption, parse_mode: 'HTML' }).catch(() => {});
      }
    } else if (kind === 'oc') {
      const o = await openContainer(db, uid, Number(x), `cb${q.id}`);
      const car = await db.get('SELECT * FROM cars WHERE id = :c', { ':c': o.car_id });
      const uc = await db.get(`SELECT * FROM user_cars WHERE source = 'open' AND source_ref = :i`, { ':i': o.id });
      await answer(q, `${RARITY[car.rarity]?.icon ?? ''} ${car.name}!`);
      const caption = '📦 <b>Контейнер открыт!</b>\n\n' + carCardText(car, { autoSold: uc.status === 'sold' ? uc.sold_amount : null });
      const kb = uc.status === 'owned' ? { inline_keyboard: [[{ text: '💰 Продать', callback_data: `s:${uc.id}` }, { text: '🚗 Гараж', callback_data: 'gp:1' }]] } : undefined;
      await sendCar(db, api, InputFile, chat.id, car.id, caption, kb);
    } else if (kind === 'gup') {
      const t = await upgradeGarage(db, uid);
      await answer(q, `🅿️ Гараж расширен до ${(await getUser(db, uid)).garage_capacity} мест за ${money(t.price)}`, true);
      await editScreen(q, await garageScreen(db, uid));
    } else if (kind === 'oa' || kind === 'od') {
      const o = await answerOffer(db, uid, Number(x), kind === 'oa');
      await answer(q, kind === 'oa' ? `✅ Машина твоя за ${money(o.price)}` : 'Предложение отклонено', true);
      if (q.message) await api.editMessageReplyMarkup({ chat_id: chat.id, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {});
    } else if (kind === 'bonus') {
      const b = await claimBonus(db, uid);
      await answer(q, `🎁 +${money(b.amount)}`, true);
      await editScreen(q, await profileScreen(db, uid));
    } else if (kind === 'vip') {
      await buyVip(db, uid);
      await answer(q, '👑 VIP активирован навсегда!', true);
      await editScreen(q, await shopScreen(db, uid));
    } else if (kind === 'buy') {
      const r = await buyLot(db, uid, Number(x), `cb${q.id}`);
      await answer(q, `🎁 «${r.lot.title}» куплено!${r.lot.container_qty ? ' Контейнеры — в гараже.' : ''}`, true);
    } else if (kind === 'top') {
      await answer(q);
      await editScreen(q, await topScreen(db, x));
    } else {
      await answer(q);
    }
  } catch (e) {
    const ge = toGameError(e);
    if (!ge) { await answer(q, 'Ошибка, попробуй ещё раз', true); throw e; }
    await answer(q, '⚠️ ' + errText(ge), true);
  }
  void isGroup;
  await sync(db, api, InputFile, { roomId: roomTouched, limit: 3 });
}
