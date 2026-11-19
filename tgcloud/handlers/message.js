// handlers/message.js — личка: меню, команды; группы: своя комната аукциона.
import { api, db, InputFile } from 'sdk';
import { ensureUser, joinRoom, leaveRoom, myRoom, bid, claimBonus, transfer, redeemPromo, toGameError, getUser } from '../lib/engine.js';
import { sync, postRoom } from '../lib/live.js';
import { money, esc } from '../lib/views.js';
import { errText } from '../lib/texts.js';
import { MENU, menuKeyboard, welcomeText, helpText, profileScreen, garageScreen, shopScreen, topScreen, friendsScreen } from '../lib/botui.js';
import { ADMIN_IDS, BOT_USERNAME, MINI_APP_URL } from '../lib/config.js';
import { deliver, deliveredText, sendFeedback } from '../lib/stars.js';

const reply = (m, text, extra = {}) => api.sendMessage({
  chat_id: m.chat.id, text, parse_mode: 'HTML', ...(m.message_thread_id ? { message_thread_id: m.message_thread_id } : {}), ...extra,
});

async function registerGroup(chat) {
  await db.run(
    `INSERT INTO groups (chat_id, title, username, created_at) VALUES (:c, :t, :u, (SELECT now FROM v_now))
     ON CONFLICT (chat_id) DO UPDATE SET title = excluded.title, username = excluded.username, is_active = 1`,
    { ':c': chat.id, ':t': chat.title ?? null, ':u': chat.username ?? null });
}

async function isChatAdmin(chatId, userId) {
  try {
    const m = await api.getChatMember({ chat_id: chatId, user_id: userId });
    return ['creator', 'administrator'].includes(m.status);
  } catch { return false; }
}

const COMMANDS = {
  [MENU.play]: 'play', [MENU.garage]: 'garage', [MENU.profile]: 'profile', [MENU.bonus]: 'bonus',
  [MENU.shop]: 'shop', [MENU.top]: 'top', [MENU.friends]: 'friends', [MENU.help]: 'help',
};

export default async function (m) {
  if (!m.from || m.from.is_bot) return;
  // оплата звёздами прошла — выдать товар (раньше любых команд)
  if (m.successful_payment) {
    const uid = await ensureUser(db, m.from, { admin: ADMIN_IDS.includes(Number(m.from.id)) });
    const r = await deliver(db, uid, m.successful_payment);
    if (r.refund) await api.refundStarPayment({ user_id: m.from.id, telegram_payment_charge_id: r.charge }).catch((e) => console.warn('refund', String(e?.message ?? e)));
    await reply(m, deliveredText(r), { reply_markup: { inline_keyboard: [[{ text: '🎮 Открыть игру', web_app: { url: MINI_APP_URL } }]] } });
    await sync(db, api, InputFile, { limit: 3 });
    return;
  }
  const text = String(m.text ?? '').trim();
  const isPrivate = m.chat.type === 'private';
  const isGroup = m.chat.type === 'group' || m.chat.type === 'supergroup';
  let cmd = null, args = '';
  const c = /^\/(\w+)(@\w+)?(?:\s+([\s\S]*))?$/.exec(text);
  if (c) {
    if (c[2] && c[2].toLowerCase() !== '@' + BOT_USERNAME.toLowerCase()) return;
    cmd = c[1].toLowerCase(); args = (c[3] ?? '').trim();
  } else if (isPrivate && COMMANDS[text]) cmd = COMMANDS[text];
  else if (/^(ставка|с|bet|b)\s+\d+$/i.test(text)) { cmd = 'bet'; args = text.split(/\s+/)[1]; }
  if (!cmd) return;

  const ref = /ref_(\d+)/.exec(args)?.[1] ?? null;
  const uid = await ensureUser(db, m.from, { admin: ADMIN_IDS.includes(Number(m.from.id)), ref: cmd === 'start' ? ref : null });
  const u = await getUser(db, uid);
  if (u.is_banned) { if (isPrivate) await reply(m, '⛔ Аккаунт заблокирован.'); return; }
  if (isGroup) await registerGroup(m.chat);
  const scope = isGroup ? { scope: 'group', scopeId: m.chat.id } : { scope: 'global', scopeId: 0 };
  let roomTouched = null;

  try {
    switch (cmd) {
      case 'start':
        if (!isPrivate) break;
        await reply(m, welcomeText(m.from.first_name), { reply_markup: menuKeyboard() });
        break;
      case 'help':
        await reply(m, helpText(), isPrivate ? { reply_markup: menuKeyboard() } : {});
        break;
      case 'play': case 'auction': case 'аукцион': {
        if (!isPrivate && !isGroup) break;
        const roomId = await joinRoom(db, uid, { ...scope, via: 'bot' });
        await sync(db, api, InputFile, { roomId });
        await postRoom(db, api, InputFile, roomId, m.chat.id, { userId: isPrivate ? uid : null, threadId: m.message_thread_id ?? null });
        roomTouched = roomId;
        break;
      }
      case 'bet': {
        const room = await myRoom(db, uid, scope)
          ?? (isGroup ? { id: await joinRoom(db, uid, { ...scope, via: 'bot' }) } : null);
        if (!room) { await reply(m, 'Сначала войди в комнату: «🎮 Играть»'); break; }
        const amount = Math.floor(Number(String(args).replace(/[\s$]/g, '')));
        const r = await bid(db, uid, room.id, { amount, opId: `m${m.chat.id}:${m.message_id}` });
        roomTouched = room.id;
        if (isPrivate) await reply(m, `✅ Ставка <b>${money(r.auction.current_bid)}</b> принята.`);
        break;
      }
      case 'leave': {
        const room = await myRoom(db, uid, scope);
        if (room) { await leaveRoom(db, uid, room.id); roomTouched = room.id; }
        await reply(m, room ? '🚪 Ты вышел из комнаты.' : 'Ты не в комнате.');
        break;
      }
      case 'stop': {
        if (!isGroup) break;
        if (!(await isChatAdmin(m.chat.id, uid)) && !u.is_admin) { await reply(m, 'Останавливать аукцион могут только админы группы.'); break; }
        await db.run(`UPDATE rooms SET stop_requested = 1, rev = rev + 1 WHERE scope = 'group' AND scope_id = :c AND status = 'open'`, { ':c': m.chat.id });
        await reply(m, '⏹ Аукцион остановится после текущего контейнера. Запустить снова — /play');
        break;
      }
      case 'report': case 'idea': case 'bug': {
        if (!isPrivate) { await reply(m, `Напиши в личку: @${BOT_USERNAME}`); break; }
        if (!args) { await reply(m, 'Опиши проблему или идею одним сообщением:\n<code>/report не открывается гараж</code>\n<code>/idea добавить турниры</code>'); break; }
        await sendFeedback(db, uid, cmd === 'idea' ? 'idea' : 'bug', args);
        await reply(m, '📨 Спасибо! Сообщение отправлено разработчикам — ответ придёт сюда.');
        break;
      }
      case 'garage': case 'profile': case 'shop': case 'friends': case 'bonus': case 'top':
      case 'transfer': case 'promo': {
        if (!isPrivate) { await reply(m, `Эта команда работает в личке: @${BOT_USERNAME}`); break; }
        await personal(m, uid, cmd, args);
        break;
      }
      default: break;
    }
  } catch (e) {
    const ge = toGameError(e);
    if (!ge) throw e;
    await reply(m, '⚠️ ' + errText(ge));
  }
  await sync(db, api, InputFile, { roomId: roomTouched, limit: 3 });
}

async function personal(m, uid, cmd, args) {
  const show = async (screen) => reply(m, screen.text, { reply_markup: screen.reply_markup });
  if (cmd === 'garage') return show(await garageScreen(db, uid));
  if (cmd === 'profile') return show(await profileScreen(db, uid));
  if (cmd === 'shop') return show(await shopScreen(db, uid));
  if (cmd === 'friends') return show(await friendsScreen(db, uid));
  if (cmd === 'top') return show(await topScreen(db));
  if (cmd === 'bonus') {
    const b = await claimBonus(db, uid);
    return reply(m, `🎁 Бонус <b>${money(b.amount)}</b> зачислен! Следующий — через 4 часа.`);
  }
  if (cmd === 'transfer') {
    const [to, amount] = args.split(/\s+/);
    if (!to || !amount) return reply(m, 'Перевод: <code>/transfer @игрок 5000</code>');
    const r = await transfer(db, uid, to, amount, `m${m.chat.id}:${m.message_id}`);
    return reply(m, `💸 Переведено ${money(r.amount)} игроку ${esc(r.to.username ? '@' + r.to.username : r.to.first_name ?? r.to.id)}. Получит ${money(r.net)} (комиссия ${money(r.commission)}).`);
  }
  if (cmd === 'promo') {
    if (!args) return reply(m, 'Промокод: <code>/promo КОД</code>');
    const p = await redeemPromo(db, uid, args);
    const parts = [];
    if (p.money) parts.push(money(p.money));
    if (p.container_qty) parts.push(`📦 контейнер ×${p.container_qty}`);
    if (p.vip) parts.push('👑 VIP');
    if (p.car_id) parts.push('🚗 машина');
    return reply(m, `🎉 Промокод активирован: ${parts.join(', ') || 'готово'}.`);
  }
}
