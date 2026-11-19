// lib/live.js — синхронизация бота и Mini App.
//
// Состояние игры одно — в базе. Mini App опрашивает его раз в секунду, а сообщения
// бота о комнатах (в личке и в группах) запоминаются в room_msgs и перерисовываются,
// когда в комнате что-то изменилось (rooms.rev) или идёт отсчёт таймера. Таймеров на
// платформе нет, поэтому всё это происходит при каждом обращении к боту или Mini App:
// sync() «догоняет» время, обновляет устаревшие сообщения и отправляет уведомления.
import { tick, sellRate } from './engine.js';
import { roomView, roomText, roomKeyboard, carCardText, money, who, esc, RARITY } from './views.js';
import { MINI_APP_URL, appLink } from './config.js';

const COUNTDOWN_EVERY_S = 4;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function b64(s) {
  const clean = String(s).replace(/^data:[^,]*,/, '').replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0, buf = 0, bits = 0;
  for (const ch of clean) {
    buf = (buf << 6) | B64.indexOf(ch); bits += 6;
    if (bits >= 8) { bits -= 8; out[o++] = (buf >> bits) & 255; }
  }
  return out.subarray(0, o);
}

export async function registerRoomMsg(db, { chatId, messageId, roomId, userId = null, rev = 0 }) {
  // в одном чате живёт одно сообщение комнаты — старые больше не обновляются
  await db.run('UPDATE room_msgs SET active = 0 WHERE chat_id = :c AND room_id = :r AND active = 1', { ':c': chatId, ':r': roomId });
  await db.run(
    `INSERT INTO room_msgs (chat_id, message_id, room_id, user_id, shown_rev, shown_at) VALUES (:c, :m, :r, :u, :rev, (SELECT now FROM v_now))
     ON CONFLICT (chat_id, message_id) DO UPDATE SET room_id = excluded.room_id, active = 1, shown_rev = excluded.shown_rev, shown_at = excluded.shown_at`,
    { ':c': chatId, ':m': messageId, ':r': roomId, ':u': userId, ':rev': rev });
}

const isGroupChat = (chatId) => Number(chatId) < 0;

export function renderRoom(v, chatId) {
  const group = isGroupChat(chatId);
  return {
    text: roomText(v, { group }),
    reply_markup: roomKeyboard(v, { group, appUrl: MINI_APP_URL, appLink: appLink(group ? `g${-Number(chatId)}` : 'play') }),
  };
}

// Отправить новое живое сообщение комнаты в чат.
export async function postRoom(db, api, roomId, chatId, { userId = null, threadId = null } = {}) {
  const v = await roomView(db, roomId, userId);
  const m = await api.sendMessage({ chat_id: chatId, parse_mode: 'HTML', ...renderRoom(v, chatId), ...(threadId ? { message_thread_id: threadId } : {}) });
  await registerRoomMsg(db, { chatId, messageId: m.message_id, roomId, userId, rev: v.rev });
  return m;
}

async function editRow(db, api, row, v) {
  const claim = await db.run(
    'UPDATE room_msgs SET shown_rev = :rev, shown_at = (SELECT now FROM v_now) WHERE chat_id = :c AND message_id = :m AND shown_at = :at',
    { ':rev': v.rev, ':c': row.chat_id, ':m': row.message_id, ':at': row.shown_at });
  if (!claim.rowsAffected) return false; // уже обновляет другой запрос
  try {
    await api.editMessageText({ chat_id: row.chat_id, message_id: row.message_id, parse_mode: 'HTML', ...renderRoom(v, row.chat_id) });
    return true;
  } catch (e) {
    const d = String(e?.description ?? e?.message ?? e);
    if (/not modified/i.test(d)) return true;
    if (/not found|can't be edited|MESSAGE_ID_INVALID|chat not found|bot was blocked|kicked|forbidden|deactivated/i.test(d)) {
      await db.run('UPDATE room_msgs SET active = 0 WHERE chat_id = :c AND message_id = :m', { ':c': row.chat_id, ':m': row.message_id });
    } else if (/Too Many Requests/i.test(d)) {
      // лимит Telegram — попробуем позже
      await db.run('UPDATE room_msgs SET shown_rev = -1 WHERE chat_id = :c AND message_id = :m', { ':c': row.chat_id, ':m': row.message_id });
    } else console.warn('room edit', d);
    return false;
  }
}

// Перерисовать устаревшие сообщения: сначала указанной комнаты, затем любые.
export async function refreshMessages(db, api, { roomId = null, limit = 4 } = {}) {
  const rows = await db.all(
    `SELECT m.*, r.rev, r.status AS room_status,
            EXISTS (SELECT 1 FROM auctions WHERE room_id = r.id AND status = 'active') AS running
     FROM room_msgs m JOIN rooms r ON r.id = m.room_id
     WHERE m.active = 1 AND (:r IS NULL OR m.room_id = :r)
       AND m.shown_at <= (SELECT now FROM v_now) - CASE WHEN m.shown_rev < r.rev THEN 0 ELSE 1 END
       AND (m.shown_rev < r.rev OR (r.status = 'open' AND m.shown_at <= (SELECT now FROM v_now) - :cd))
     ORDER BY (m.shown_rev < r.rev) DESC, m.shown_at LIMIT :n`,
    { ':r': roomId, ':cd': COUNTDOWN_EVERY_S, ':n': limit });
  const views = new Map();
  let n = 0;
  for (const row of rows) {
    if (!views.has(row.room_id)) views.set(row.room_id, await roomView(db, row.room_id));
    if (await editRow(db, api, row, views.get(row.room_id))) n++;
    // закрытую комнату после последнего обновления больше не трогаем
    if (row.room_status === 'closed') await db.run('UPDATE room_msgs SET active = 0 WHERE chat_id = :c AND message_id = :m', { ':c': row.chat_id, ':m': row.message_id });
  }
  return n;
}

// Фото машины для бота: file_id из кэша или загрузка картинки, сохранённой в Mini App.
export async function carPhoto(db, api, InputFile, carId) {
  const img = await db.get(`SELECT * FROM images WHERE kind = 'car' AND ref_id = :c`, { ':c': carId });
  if (!img) return null;
  if (img.file_id) return img.file_id;
  return { upload: new InputFile(b64(img.data), `car-${carId}.jpg`, { type: img.mime }), v: img.v };
}

async function sendCar(db, api, InputFile, chatId, carId, caption, markup) {
  const ph = await carPhoto(db, api, InputFile, carId).catch(() => null);
  if (!ph) return api.sendMessage({ chat_id: chatId, text: caption, parse_mode: 'HTML', reply_markup: markup });
  const m = await api.sendPhoto({ chat_id: chatId, photo: typeof ph === 'string' ? ph : ph.upload, caption, parse_mode: 'HTML', reply_markup: markup });
  if (typeof ph !== 'string' && m.photo?.length) {
    await db.run(`UPDATE images SET file_id = :f WHERE kind = 'car' AND ref_id = :c AND v = :v`, { ':f': m.photo[m.photo.length - 1].file_id, ':c': carId, ':v': ph.v });
  }
  return m;
}

// Уведомления (победа, кик, предложения о продаже) — по одному, без повторов.
export async function deliverOutbox(db, api, InputFile, { limit = 3 } = {}) {
  const rows = await db.all('SELECT * FROM outbox WHERE sent_at IS NULL AND claimed_at IS NULL ORDER BY id LIMIT :n', { ':n': limit });
  let n = 0;
  for (const o of rows) {
    const claim = await db.run('UPDATE outbox SET claimed_at = (SELECT now FROM v_now) WHERE id = :i AND claimed_at IS NULL', { ':i': o.id });
    if (!claim.rowsAffected) continue;
    try {
      await sendOne(db, api, InputFile, o);
      n++;
    } catch (e) {
      const d = String(e?.description ?? e?.message ?? e);
      if (!/forbidden|chat not found|blocked|deactivated/i.test(d)) console.warn('outbox', o.kind, d);
    }
    await db.run('UPDATE outbox SET sent_at = (SELECT now FROM v_now) WHERE id = :i', { ':i': o.id });
  }
  return n;
}

async function sendOne(db, api, InputFile, o) {
  if (o.kind === 'won') {
    const a = await db.get('SELECT * FROM auctions WHERE id = :a', { ':a': o.ref });
    const uc = await db.get(`SELECT * FROM user_cars WHERE source = 'auction' AND source_ref = :a`, { ':a': o.ref });
    if (!a || !uc) return;
    const car = await db.get('SELECT * FROM cars WHERE id = :c', { ':c': uc.car_id });
    const r = RARITY[car.rarity] ?? RARITY.common;
    let sale = null;
    if (uc.status === 'owned') sale = await sellRate(db, uc.user_id, uc.id).catch(() => null);
    const caption = `🏆 <b>Контейнер твой за ${money(a.current_bid)}!</b>\n${r.icon} Внутри:\n\n` + carCardText(car, { sale, autoSold: uc.status === 'sold' ? uc.sold_amount : null });
    const kb = uc.status === 'owned'
      ? { inline_keyboard: [[{ text: `💰 Продать за ${money(sale?.amount ?? 0)}`, callback_data: `s:${uc.id}` }, { text: '🚗 В гараж', web_app: { url: MINI_APP_URL + '#garage' } }]] }
      : undefined;
    await sendCar(db, api, InputFile, o.chat_id, car.id, caption, kb);
  } else if (o.kind === 'kicked') {
    await api.sendMessage({ chat_id: o.chat_id, text: '😴 Ты пропустил несколько контейнеров подряд и вышел из комнаты. Нажми «🎮 Играть», чтобы вернуться.' });
  } else if (o.kind === 'offer') {
    const of = await db.get(
      `SELECT o.*, c.name, c.rarity, c.price AS car_price, s.username, s.first_name FROM sale_offers o JOIN user_cars uc ON uc.id = o.user_car_id
       JOIN cars c ON c.id = uc.car_id LEFT JOIN users s ON s.id = o.seller_id WHERE o.id = :o`, { ':o': o.ref });
    if (!of || of.status !== 'pending') return;
    const r = RARITY[of.rarity] ?? RARITY.common;
    await api.sendMessage({
      chat_id: o.chat_id, parse_mode: 'HTML',
      text: `🤝 ${esc(who({ username: of.username, first_name: of.first_name }))} предлагает купить машину:\n${r.icon} <b>${esc(of.name)}</b> (стоимость ${money(of.car_price)})\nЦена: <b>${money(of.price)}</b>\n\nПредложение действует 15 минут.`,
      reply_markup: { inline_keyboard: [[{ text: '✅ Купить', callback_data: `oa:${of.id}` }, { text: '❌ Отказаться', callback_data: `od:${of.id}` }]] },
    });
  } else if (o.kind === 'offer_done') {
    const of = await db.get(`SELECT o.*, c.name FROM sale_offers o JOIN user_cars uc ON uc.id = o.user_car_id JOIN cars c ON c.id = uc.car_id WHERE o.id = :o`, { ':o': o.ref });
    if (!of) return;
    const net = Math.floor((of.price * (10000 - of.rate_bps)) / 10000);
    await api.sendMessage({
      chat_id: o.chat_id, parse_mode: 'HTML',
      text: of.status === 'accepted' ? `✅ ${esc(of.name)} продана за ${money(of.price)}. Тебе зачислено <b>${money(net)}</b> (комиссия ${of.rate_bps / 100}%).`
        : `❌ Покупатель отказался от ${esc(of.name)}.`,
    });
  } else if (o.kind === 'transfer') {
    const t = await db.get('SELECT t.*, u.username, u.first_name FROM transfers t LEFT JOIN users u ON u.id = t.from_id WHERE t.id = :i', { ':i': o.ref });
    if (t) await api.sendMessage({ chat_id: o.chat_id, parse_mode: 'HTML', text: `💸 ${esc(who({ username: t.username, first_name: t.first_name }))} перевёл тебе <b>${money(t.amount - t.commission)}</b>.` });
  }
}

// Главная точка синхронизации: вызывается в каждом обработчике и endpoint.
export async function sync(db, api, InputFile, { roomId = null, limit = 4 } = {}) {
  try { await tick(db); } catch (e) { console.warn('tick', String(e?.message ?? e)); }
  try {
    if (roomId) await refreshMessages(db, api, { roomId, limit: 8 });
    await refreshMessages(db, api, { limit });
  } catch (e) { console.warn('refresh', String(e?.message ?? e)); }
  try { await deliverOutbox(db, api, InputFile); } catch (e) { console.warn('outbox', String(e?.message ?? e)); }
}
