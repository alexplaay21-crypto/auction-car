// Синхронизация бота и Mini App: живые сообщения комнат и уведомления.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { makeDb, setClock } from './db-shim.js';
import * as E from '../tgcloud/lib/engine.js';
import { postRoom, refreshMessages, deliverOutbox, sync, b64 } from '../tgcloud/lib/live.js';
import { roomView, roomText } from '../tgcloud/lib/views.js';

let db, clock = 0, seq = 0, api, sent, edits;
const tick = async (s) => { clock += s; await setClock(db, clock); };
class InputFile { constructor(b, n) { this.b = b; this.n = n; } }

beforeEach(async () => {
  db = makeDb(); clock = 0; seq = 0; sent = []; edits = [];
  E.dropSettingsCache();
  await E.migrate(db);
  for (const n of [2, 3]) await E.ensureUser(db, { id: n, username: 'u' + n });
  let mid = 100;
  api = {
    async sendMessage(p) { sent.push(p); return { message_id: ++mid }; },
    async sendPhoto(p) { sent.push(p); return { message_id: ++mid, photo: [{ file_id: 'PH' }] }; },
    async editMessageText(p) { edits.push(p); return true; },
  };
});

test('ставка из Mini App перерисовывает сообщение комнаты в боте', async () => {
  const room = await E.joinRoom(db, 2, { via: 'bot' });
  await postRoom(db, api, room, 2, { userId: 2 });
  assert.match(sent[0].text, /Аукцион · комната №1/);
  assert.equal(sent[0].reply_markup.inline_keyboard[0].length, 3, 'кнопки ставок');
  await E.joinRoom(db, 3, { via: 'app' });
  await E.bid(db, 3, room, { raise: 500, opId: 'x' + ++seq }); // ставка «из Mini App»
  await tick(1);
  assert.equal(await refreshMessages(db, api, { roomId: room }), 1);
  assert.match(edits[0].text, /@u3/);
  assert.equal(await refreshMessages(db, api, { roomId: room }), 0, 'без изменений — не трогаем');
  await tick(5);
  assert.equal(await refreshMessages(db, api, { roomId: room }), 1, 'идёт отсчёт — обновляем таймер');
});

test('победа: сообщение комнаты показывает итог, победителю приходит карточка машины', async () => {
  const room = await E.joinRoom(db, 2, { via: 'bot' });
  await postRoom(db, api, room, 2, { userId: 2 });
  await E.bid(db, 2, room, { raise: 500, opId: 'y1' });
  await tick(31);
  await sync(db, api, InputFile, { roomId: room });
  const last = edits[edits.length - 1];
  assert.match(last.text, /забирает за/);
  const card = sent.find((s) => /Контейнер твой/.test(s.text ?? s.caption ?? ''));
  assert.ok(card, 'карточка победителю');
  assert.match(card.reply_markup.inline_keyboard[0][0].text, /Продать за/);
  assert.equal(await deliverOutbox(db, api, InputFile), 0, 'уведомление не дублируется');
  const v = await roomView(db, room);
  assert.match(roomText(v), /Следующий контейнер/);
});

test('base64 картинок декодируется без atob', () => {
  assert.deepEqual([...b64('data:image/png;base64,iVBORw0KGgo=')], [137, 80, 78, 71, 13, 10, 26, 10]);
});
