import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { makeDb } from './db-shim.js';
import * as E from '../tgcloud/lib/engine.js';
import * as G from '../tgcloud/lib/engine3.js';
import * as S from '../tgcloud/lib/stars.js';

let db;
const bal = async (u) => (await E.getUser(db, u)).balance;
const ok = async () => assert.deepEqual(await E.audit(db), []);
const pay = (u, product, stars, charge, season = 0) => S.deliver(db, u, { invoice_payload: `st:${product}:${u}:${season}`, total_amount: stars, telegram_payment_charge_id: charge, currency: 'XTR' });

beforeEach(async () => {
  db = makeDb(); E.dropSettingsCache();
  await E.migrate(db);
  await E.ensureUser(db, { id: 2, username: 'u2' });
  await E.ensureUser(db, { id: 9, username: 'adm' }, { admin: true });
});

test('пакеты валюты: каждый следующий выгоднее', async () => {
  const list = (await S.starProducts(db, 2)).filter((p) => p.kind === 'money');
  for (let i = 1; i < list.length; i++) assert.ok(list[i].money / list[i].stars > list[i - 1].money / list[i - 1].stars);
  assert.equal(list[0].bonus_pct, 0);
  assert.equal(list.at(-1).bonus_pct, 140);
});

test('оплата валюты зачисляется один раз', async () => {
  const b0 = await bal(2);
  await pay(2, 'm250', 250, 'c1');
  const again = await pay(2, 'm250', 250, 'c1');
  assert.equal(again.duplicate, true);
  assert.equal(await bal(2), b0 + 350_000);
  await ok();
});

test('VIP за звёзды; повторная покупка не проходит проверку, а оплаченная превращается в деньги', async () => {
  const inv = await S.invoiceParams(db, 2, 'vip');
  assert.equal(inv.currency, 'XTR'); assert.equal(inv.prices[0].amount, 199);
  assert.deepEqual(await S.precheck(db, { invoice_payload: inv.payload, total_amount: 199, currency: 'XTR', from: { id: 2 } }), { ok: true });
  await pay(2, 'vip', 199, 'v1');
  assert.equal((await E.getUser(db, 2)).is_vip, 1);
  const pc = await S.precheck(db, { invoice_payload: inv.payload, total_amount: 199, currency: 'XTR', from: { id: 2 } });
  assert.equal(pc.ok, false);
  const b0 = await bal(2);
  const r = await pay(2, 'vip', 199, 'v2');
  assert.equal(r.replaced, true);
  assert.equal(await bal(2), b0 + (await E.settings(db)).vip_price);
  await ok();
});

test('премиум Battle Pass за звёзды', async () => {
  const se = await G.currentSeason(db);
  const inv = await S.invoiceParams(db, 2, 'bp');
  assert.ok(inv.payload.endsWith(':' + se.id));
  assert.equal((await S.precheck(db, { invoice_payload: inv.payload, total_amount: 1, currency: 'XTR', from: { id: 2 } })).ok, false); // не та цена
  await pay(2, 'bp', 149, 'b1', se.id);
  assert.equal((await G.bpView(db, 2)).premium, true);
  await assert.rejects(S.invoiceParams(db, 2, 'bp'), (e) => e.code === 'BP_ALREADY');
  await ok();
});

test('сообщение о проблеме уходит админу, ответ — игроку', async () => {
  await assert.rejects(S.sendFeedback(db, 2, 'bug', 'ой'), /FEEDBACK_SHORT/);
  const id = await S.sendFeedback(db, 2, 'bug', 'Не открывается гараж');
  assert.ok((await db.get(`SELECT 1 AS x FROM outbox WHERE chat_id = 9 AND kind = 'feedback' AND ref = :i`, { ':i': id })));
  await S.answerFeedback(db, 9, id, 'Исправили, спасибо!');
  assert.ok((await db.get(`SELECT 1 AS x FROM outbox WHERE chat_id = 2 AND kind = 'feedback_reply' AND ref = :i`, { ':i': id })));
  assert.equal((await S.feedbackList(db, 'new')).length, 0);
  for (let i = 0; i < 4; i++) await S.sendFeedback(db, 2, 'idea', 'идея номер ' + i);
  await assert.rejects(S.sendFeedback(db, 2, 'idea', 'шестая идея'), /FEEDBACK_LIMIT/);
});

test('кик после двух пропусков', async () => {
  assert.equal((await E.settings(db)).kick_after, 2);
});
