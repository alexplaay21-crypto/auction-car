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
import { ART } from './art_manifest.js';
import { PHOTOS } from './photo_manifest.js';

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

export async function registerRoomMsg(db, { chatId, messageId, roomId, userId = null, rev = 0, media = null }) {
  // в одном чате живёт одно сообщение комнаты — старые больше не обновляются
  await db.run('UPDATE room_msgs SET active = 0 WHERE chat_id = :c AND room_id = :r AND active = 1', { ':c': chatId, ':r': roomId });
  await db.run(
    `INSERT INTO room_msgs (chat_id, message_id, room_id, user_id, shown_rev, shown_at, media) VALUES (:c, :m, :r, :u, :rev, (SELECT now FROM v_now), :md)
     ON CONFLICT (chat_id, message_id) DO UPDATE SET room_id = excluded.room_id, active = 1, shown_rev = excluded.shown_rev, shown_at = excluded.shown_at, media = excluded.media`,
    { ':c': chatId, ':m': messageId, ':r': roomId, ':u': userId, ':rev': rev, ':md': media });
}

const isGroupChat = (chatId) => Number(chatId) < 0;

export function renderRoom(v, chatId) {
  const group = isGroupChat(chatId);
  return {
    text: roomText(v, { group }),
    reply_markup: roomKeyboard(v, { group, appUrl: MINI_APP_URL, appLink: appLink(group ? `g${-Number(chatId)}` : 'play') }),
  };
}

// ---------- картинки для бота ----------
// 1) фото, загруженное в админке (file_id после первой отправки);
// 2) готовый рисунок стартового каталога (JPEG рядом с Mini App);
// иначе — без картинки.
const artUrl = (kind, id) => {
  if (kind === 'car' && PHOTOS[id]) return `${MINI_APP_URL}art/car-${id}.jpg?v=${PHOTOS[id]}`;
  const max = kind === 'car' ? ART.cars : ART.containers;
  return Number(id) >= 1 && Number(id) <= max ? `${MINI_APP_URL}art/${kind}-${id}.jpg?v=${ART.v}` : null;
};

export async function imageFor(db, InputFile, kind, id) {
  const img = await db.get('SELECT * FROM images WHERE kind = :k AND ref_id = :i', { ':k': kind, ':i': id });
  if (img) {
    if (img.file_id) return { media: img.file_id, key: `${kind}:${id}:u${img.v}` };
    return { media: new InputFile(b64(img.data), `${kind}-${id}.jpg`, { type: img.mime }), key: `${kind}:${id}:u${img.v}`, kind, id, v: img.v };
  }
  const url = artUrl(kind, id);
  return url ? { media: url, key: `${kind}:${id}:a${kind === 'car' && PHOTOS[id] ? 'p' + PHOTOS[id] : ART.v}` } : null;
}

// после первой загрузки запоминаем file_id, чтобы не загружать картинку снова
async function rememberFileId(db, img, msg) {
  if (!img?.v || !msg?.photo?.length) return;
  await db.run('UPDATE images SET file_id = :f WHERE kind = :k AND ref_id = :i AND v = :v',
    { ':f': msg.photo[msg.photo.length - 1].file_id, ':k': img.kind, ':i': img.id, ':v': img.v });
}

export async function carPhoto(db, api, InputFile, carId) {
  const img = await imageFor(db, InputFile, 'car', carId);
  if (!img) return null;
  return typeof img.media === 'string' ? img.media : { upload: img.media, v: img.v, img };
}

// какая картинка у сообщения комнаты сейчас: разыгранная машина или текущий контейнер
async function roomImage(db, InputFile, v) {
  const a = v.auction;
  if (!a) return null;
  if (a.status === 'won' && a.car) return imageFor(db, InputFile, 'car', a.car.id);
  return imageFor(db, InputFile, 'container', a.container.id);
}

// Отправить новое живое сообщение комнаты в чат (с картинкой, если она есть).
export async function postRoom(db, api, InputFile, roomId, chatId, { userId = null, threadId = null } = {}) {
  const v = await roomView(db, roomId, userId);
  const r = renderRoom(v, chatId);
  const thread = threadId ? { message_thread_id: threadId } : {};
  const img = await roomImage(db, InputFile, v).catch(() => null);
  let m;
  if (img) {
    try {
      m = await api.sendPhoto({ chat_id: chatId, photo: img.media, caption: r.text, parse_mode: 'HTML', reply_markup: r.reply_markup, ...thread });
      await rememberFileId(db, img, m);
    } catch (e) { console.warn('room photo', String(e?.description ?? e)); m = null; }
  }
  if (!m) m = await api.sendMessage({ chat_id: chatId, parse_mode: 'HTML', ...r, ...thread });
  await registerRoomMsg(db, { chatId, messageId: m.message_id, roomId, userId, rev: v.rev, media: m.photo ? (img?.key ?? 'photo') : null });
  return m;
}

async function editRow(db, api, InputFile, row, v) {
  const claim = await db.run(
    'UPDATE room_msgs SET shown_rev = :rev, shown_at = (SELECT now FROM v_now) WHERE chat_id = :c AND message_id = :m AND shown_at = :at',
    { ':rev': v.rev, ':c': row.chat_id, ':m': row.message_id, ':at': row.shown_at });
  if (!claim.rowsAffected) return false; // уже обновляет другой запрос
  const r = renderRoom(v, row.chat_id);
  const target = { chat_id: row.chat_id, message_id: row.message_id };
  try {
    if (!row.media) {
      await api.editMessageText({ ...target, parse_mode: 'HTML', ...r });
    } else {
      const img = await roomImage(db, InputFile, v).catch(() => null);
      if (img && img.key !== row.media) {
        // сменился контейнер или разыграна машина — меняем картинку вместе с подписью
        const m = await api.editMessageMedia({ ...target, media: { type: 'photo', media: img.media, caption: r.text, parse_mode: 'HTML' }, reply_markup: r.reply_markup });
        await rememberFileId(db, img, m);
        await db.run('UPDATE room_msgs SET media = :md WHERE chat_id = :c AND message_id = :m', { ':md': img.key, ':c': row.chat_id, ':m': row.message_id });
      } else {
        await api.editMessageCaption({ ...target, caption: r.text, parse_mode: 'HTML', reply_markup: r.reply_markup });
      }
    }
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
export async function refreshMessages(db, api, InputFile, { roomId = null, limit = 4 } = {}) {
  const rows = await db.all(
    `SELECT m.*, r.rev, r.status AS room_status
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
    if (await editRow(db, api, InputFile, row, views.get(row.room_id))) n++;
    // закрытую комнату после последнего обновления больше не трогаем
    if (row.room_status === 'closed') await db.run('UPDATE room_msgs SET active = 0 WHERE chat_id = :c AND message_id = :m', { ':c': row.chat_id, ':m': row.message_id });
  }
  return n;
}

async function sendCar(db, api, InputFile, chatId, carId, caption, markup) {
  const img = await imageFor(db, InputFile, 'car', carId).catch(() => null);
  if (img) {
    try {
      const m = await api.sendPhoto({ chat_id: chatId, photo: img.media, caption, parse_mode: 'HTML', reply_markup: markup });
      await rememberFileId(db, img, m);
      return m;
    } catch (e) { console.warn('car photo', String(e?.description ?? e)); }
  }
  return api.sendMessage({ chat_id: chatId, text: caption, parse_mode: 'HTML', reply_markup: markup });
}

export { sendCar };

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

const NOTIFY = { won: 'n_auction', kicked: 'n_auction', offer: 'n_deals', offer_done: 'n_deals', transfer: 'n_deals', market_sold: 'n_deals', race: 'n_races' };
async function sendOne(db, api, InputFile, o) {
  const key = NOTIFY[o.kind];
  if (key) {
    const st = await db.get(`SELECT ${key} AS on_ FROM user_settings WHERE user_id = :u`, { ':u': o.chat_id }).catch(() => null);
    if (st && st.on_ === 0) return; // игрок выключил такие уведомления
  }
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
  } else if (o.kind === 'race') {
    const r = await db.get('SELECT r.*, u.username, u.first_name FROM races r LEFT JOIN users u ON u.id = r.guest_id WHERE r.id = :i', { ':i': o.ref });
    if (!r) return;
    const won = r.winner_id === o.chat_id;
    await api.sendMessage({ chat_id: o.chat_id, parse_mode: 'HTML',
      text: `🏁 ${esc(who({ username: r.username, first_name: r.first_name }))} принял твой вызов!\n${won ? '🏆 Ты победил' : '😔 Ты проиграл'}: ${(r.host_ms / 1000).toFixed(2)} с против ${(r.guest_ms / 1000).toFixed(2)} с. Ставка ${money(r.stake)}.`,
      reply_markup: { inline_keyboard: [[{ text: '🏁 Гонки', web_app: { url: MINI_APP_URL + '#race' } }]] } });
  } else if (o.kind === 'market_sold') {
    const l = await db.get('SELECT l.*, c.name FROM market_listings l JOIN user_cars uc ON uc.id = l.user_car_id JOIN cars c ON c.id = uc.car_id WHERE l.id = :i', { ':i': o.ref });
    if (l) await api.sendMessage({ chat_id: o.chat_id, parse_mode: 'HTML', text: `🛒 На рынке купили ${esc(l.name)} за ${money(l.price)}. Тебе зачислено <b>${money(Math.floor((l.price * (10000 - l.rate_bps)) / 10000))}</b>.` });
  } else if (o.kind === 'feedback') {
    const f = await db.get('SELECT f.*, u.username, u.first_name FROM feedback f LEFT JOIN users u ON u.id = f.user_id WHERE f.id = :i', { ':i': o.ref });
    if (f) await api.sendMessage({ chat_id: o.chat_id, parse_mode: 'HTML',
      text: `${f.kind === 'bug' ? '🐞 <b>Проблема</b>' : '💡 <b>Идея</b>'} №${f.id} от ${esc(who({ username: f.username, first_name: f.first_name }))} (id ${f.user_id}):\n\n${esc(f.text)}`,
      reply_markup: { inline_keyboard: [[{ text: '✍️ Ответить в админке', web_app: { url: MINI_APP_URL + '#admin' } }]] } });
  } else if (o.kind === 'feedback_reply') {
    const f = await db.get('SELECT * FROM feedback WHERE id = :i', { ':i': o.ref });
    if (f?.answer) await api.sendMessage({ chat_id: o.chat_id, parse_mode: 'HTML',
      text: `📬 <b>Ответ на твоё сообщение №${f.id}</b>\n<i>${esc(f.text.slice(0, 200))}</i>\n\n${esc(f.answer)}` });
  } else if (o.kind === 'transfer') {
    const t = await db.get('SELECT t.*, u.username, u.first_name FROM transfers t LEFT JOIN users u ON u.id = t.from_id WHERE t.id = :i', { ':i': o.ref });
    if (t) await api.sendMessage({ chat_id: o.chat_id, parse_mode: 'HTML', text: `💸 ${esc(who({ username: t.username, first_name: t.first_name }))} перевёл тебе <b>${money(t.amount - t.commission)}</b>.` });
  }
}

// Главная точка синхронизации: вызывается в каждом обработчике и endpoint.
export async function sync(db, api, InputFile, { roomId = null, limit = 4 } = {}) {
  try { await tick(db); } catch (e) { console.warn('tick', String(e?.message ?? e)); }
  try {
    if (roomId) await refreshMessages(db, api, InputFile, { roomId, limit: 8 });
    await refreshMessages(db, api, InputFile, { limit });
  } catch (e) { console.warn('refresh', String(e?.message ?? e)); }
  try { await deliverOutbox(db, api, InputFile); } catch (e) { console.warn('outbox', String(e?.message ?? e)); }
}
