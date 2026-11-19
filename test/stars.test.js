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

test('VIP за звёзды; повторная покупка не проходит проверку, а оплаченная возвращается', async () => {
  const inv = await S.invoiceParams(db, 2, 'vip');
  assert.equal(inv.currency, 'XTR'); assert.equal(inv.prices[0].amount, 199);
  assert.deepEqual(await S.precheck(db, { invoice_payload: inv.payload, total_amount: 199, currency: 'XTR', from: { id: 2 } }), { ok: true });
  await pay(2, 'vip', 199, 'v1');
  assert.equal((await E.getUser(db, 2)).is_vip, 1);
  const pc = await S.precheck(db, { invoice_payload: inv.payload, total_amount: 199, currency: 'XTR', from: { id: 2 } });
  assert.equal(pc.ok, false);
  const b0 = await bal(2);
  const r = await pay(2, 'vip', 199, 'v2');
  assert.equal(r.refund, true);
  assert.equal(await bal(2), b0);
  await ok();
});

test('премиум Battle Pass за звёзды', async () => {
  const se = await G.currentSeason(db);
  const inv = await S.invoiceParams(db, 2, 'bp');
  assert.ok(inv.payload.endsWith(':' + se.id));
  assert.equal((await S.precheck(db, { invoice_payload: inv.payload, total_amount: 1, currency: 'XTR', from: { id: 2 } })).ok, false); // не та цена
  await assert.rejects(S.invoiceParams(db, 2, 'bpdx'), { code: 'BP_NEED_PREMIUM' }, 'делюкс без премиума нельзя');
  await pay(2, 'bp', 99, 'b1', se.id);
  assert.equal((await G.bpView(db, 2)).premium, true);
  await assert.rejects(S.invoiceParams(db, 2, 'bp'), (e) => e.code === 'BP_ALREADY');
  await pay(2, 'bpdx', 49, 'd1', se.id);
  let v = await G.bpView(db, 2);
  assert.equal(v.deluxe, true); assert.equal(v.level, 5, 'делюкс: +5 уровней');
  await pay(2, 'bplvl', 5, 'l1', se.id);
  v = await G.bpView(db, 2);
  assert.equal(v.level, 6, 'уровень за 5 звёзд');
  await assert.rejects(S.invoiceParams(db, 2, 'bpdx'), { code: 'BP_DELUXE_ALREADY' });
  await db.run('UPDATE bp_progress SET xp = 15000 WHERE user_id = 2');
  await assert.rejects(S.invoiceParams(db, 2, 'bplvl'), { code: 'BP_MAX_LEVEL' });
  await db.run('UPDATE bp_progress SET xp = 14500 WHERE user_id = 2');
  await pay(2, 'bplvl', 5, 'l2', se.id);
  assert.equal((await G.bpView(db, 2)).xp, 15000, 'не выше последнего уровня');
  const car = await G.bpClaim(db, 2, 15, 'premium');
  assert.equal(car.car.rarity, 'mythic');
  await ok();
});

test('порядок в магазине: VIP, Battle Pass, деньги', async () => {
  const ids = (await S.starProducts(db, 2)).map((p) => p.id);
  assert.deepEqual(ids.slice(0, 4), ['vip', 'bp', 'bpdx', 'bplvl']);
  assert.equal(ids[4], 'm50');
  const vip = (await S.starProducts(db, 2)).find((p) => p.id === 'vip');
  assert.equal(vip.stars, 199);
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
