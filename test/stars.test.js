import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { makeDb, setClock } from './db-shim.js';
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
  assert.equal(inv.currency, 'XTR'); assert.equal(inv.prices[0].amount, 149);
  assert.deepEqual(await S.precheck(db, { invoice_payload: inv.payload, total_amount: 149, currency: 'XTR', from: { id: 2 } }), { ok: true });
  await pay(2, 'vip', 149, 'v1');
  assert.equal((await E.getUser(db, 2)).is_vip, 1);
  assert.ok(await db.get("SELECT 1 FROM user_cars WHERE user_id = 2 AND car_id = 14 AND status = 'owned'"), 'VIP дарит BMW M5 F90');
  const pc = await S.precheck(db, { invoice_payload: inv.payload, total_amount: 149, currency: 'XTR', from: { id: 2 } });
  assert.equal(pc.ok, false);
  const b0 = await bal(2);
  const r = await pay(2, 'vip', 149, 'v2');
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
  await pay(2, 'bp', 49, 'b1', se.id);
  assert.equal((await G.bpView(db, 2)).premium, true);
  await assert.rejects(S.invoiceParams(db, 2, 'bp'), (e) => e.code === 'BP_ALREADY');
  const before = (await db.get("SELECT count(*) AS n FROM user_cars uc JOIN cars c ON c.id = uc.car_id WHERE uc.user_id = 2 AND c.rarity = 'mythic'")).n;
  await pay(2, 'bpdx', 49, 'd1', se.id);
  assert.equal((await db.get("SELECT count(*) AS n FROM user_cars uc JOIN cars c ON c.id = uc.car_id WHERE uc.user_id = 2 AND c.rarity = 'mythic'")).n, before + 1, 'делюкс даёт легендарную');
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
  assert.equal(car.car.rarity, 'epic', 'в пассе легендарных нет');
  await assert.rejects(G.setLevelReward(db, { season: se.id, level: 15, track: 'premium', kind: 'car', value: 3 }), { code: 'BP_NO_LEGENDARY' });
  await ok();
});

test('порядок в магазине: VIP, Battle Pass, деньги', async () => {
  const ids = (await S.starProducts(db, 2)).map((p) => p.id);
  assert.deepEqual(ids.slice(0, 4), ['vip', 'bp', 'bpdx', 'bplvl']);
  assert.equal(ids[4], 'm50');
  const vip = (await S.starProducts(db, 2)).find((p) => p.id === 'vip');
  assert.equal(vip.stars, 149);
  assert.equal(vip.car.id, 14);
  const bp = (await S.starProducts(db, 2)).find((p) => p.id === 'bp');
  assert.equal(bp.stars, 49); assert.equal(bp.was_stars, 99);
  assert.ok(vip.perks.length >= 6);
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

test('VIP: быстрая продажа 2 часа после получения машины, без VIP — 15 минут', async () => {
  const give = async (u) => { await db.run(`INSERT INTO car_grants (op_id, user_id, car_id, source, created_at) VALUES (:o, :u, 8, 'admin', (SELECT now FROM v_now))`, { ':o': 'g' + Math.random(), ':u': u });
    return (await db.get('SELECT id FROM user_cars WHERE user_id = :u AND car_id = 8 ORDER BY id DESC LIMIT 1', { ':u': u })).id; };
  await E.ensureUser(db, { id: 5, username: 'u5' });
  await pay(2, 'vip', 149, 'vq');
  const a = await give(2), b = await give(5);
  await setClock(db, 3600);
  assert.equal((await E.sellRate(db, 2, a)).quick, true, 'VIP через час — ещё быстрая продажа');
  assert.equal((await E.sellRate(db, 5, b)).quick, false, 'без VIP через час — уже обычная');
  await E.sellCar(db, 2, a);
  await setClock(db, 7300);
  const c = await give(2);
  await setClock(db, 7300 + 7300);
  assert.equal((await E.sellRate(db, 2, c)).quick, false);
  assert.deepEqual(await E.audit(db), []);
});
