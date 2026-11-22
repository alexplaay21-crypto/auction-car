import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { makeDb, setClock } from './db-shim.js';
import * as E from '../tgcloud/lib/engine.js';
import * as G from '../tgcloud/lib/engine3.js';
import * as S from '../tgcloud/lib/stars.js';
import { skillPrice, reaction } from '../tgcloud/lib/ddl3.js';

let db, clock = 0, seq = 0;
const op = () => `v${++seq}`;
const tick = async (s) => { clock += s; await setClock(db, clock); };
const bal = async (u) => (await E.getUser(db, u)).balance;
const ok = async () => assert.deepEqual(await E.audit(db), []);
const give = async (u, car) => {
  await db.run(`INSERT INTO car_grants (op_id, user_id, car_id, source, created_at) VALUES (:o, :u, :c, 'admin', (SELECT now FROM v_now))`, { ':o': op(), ':u': u, ':c': car });
  return (await db.get('SELECT id FROM user_cars WHERE user_id = :u ORDER BY id DESC LIMIT 1', { ':u': u })).id;
};

beforeEach(async () => {
  db = makeDb(); clock = 0; seq = 0; E.dropSettingsCache();
  await E.migrate(db);
  for (const n of [2, 3, 4]) await E.ensureUser(db, { id: n, username: 'u' + n });
});

test('9 контейнеров (с британским), у каждого флаг; редкость своя в каждом контейнере, цена по силе', async () => {
  assert.equal((await db.get('SELECT count(*) AS n FROM containers')).n, 9);
  // 64 старых + новые; убранные машины не создаются (кроме старых id 36, 37 — они остаются у владельцев)
  assert.equal((await db.get('SELECT count(*) AS n FROM cars')).n, 64 + 42 * 6 + 29 + 40);
  assert.equal((await db.get('SELECT count(*) AS n FROM cars WHERE is_active = 1 AND id IN (36, 37)')).n, 0, 'вне контейнеров — не выпадают');
  // в каждом контейнере, кроме «Неизвестного» (8) и выключенной России (5): 1 мистическая, 1–2 легендарные, 6–10 эпических
  for (const c of [1, 2, 3, 4, 6, 7, 9]) {
    const r = Object.fromEntries((await db.all('SELECT c.rarity, count(*) AS n FROM container_cars cc JOIN cars c ON c.id = cc.car_id WHERE cc.container_id = :c GROUP BY c.rarity', { ':c': c })).map((x) => [x.rarity, x.n]));
    assert.equal(r.mystic, 1, `контейнер ${c}: мистическая`);
    assert.ok(r.mythic >= 1 && r.mythic <= 2, `контейнер ${c}: легендарных ${r.mythic}`);
    assert.ok(r.epic >= 6 && r.epic <= 10, `контейнер ${c}: эпических ${r.epic}`);
  }
  // сильная машина не дешевле слабой: цена растёт вместе с силой (мощность, разгон, макс. скорость)
  const cars = await db.all('SELECT power, accel_x100, max_speed, price FROM cars WHERE id IN (SELECT car_id FROM container_cars)');
  const st = (c) => 0.5 * Math.log(c.power) + 0.3 * Math.log(1000 / c.accel_x100) + 0.2 * Math.log(c.max_speed);
  cars.sort((a, b) => st(a) - st(b) || a.price - b.price);
  for (let i = 1; i < cars.length; i++) assert.ok(cars[i].price >= cars[i - 1].price - 100, 'цена не падает с ростом силы');
  const flags = (await db.all('SELECT flag FROM container_meta ORDER BY container_id')).map((r) => r.flag);
  assert.deepEqual(flags, ['jp', 'de', 'us', 'it', 'ru', 'cn', 'fr', 'world', 'uk']);
  const size = { 5: 35, 6: 48, 7: 48, 8: 68, 9: 19 };
  for (let c = 1; c <= 9; c++) assert.equal((await db.get('SELECT count(*) AS n FROM container_cars WHERE container_id = :c', { ':c': c })).n, size[c] ?? 50, `контейнер ${c}`);
  // российский контейнер убран с аукциона, его машины — в «Неизвестном»; британские машины — в своём контейнере
  assert.equal((await db.get('SELECT is_enabled FROM containers WHERE id = 5')).is_enabled, 0);
  assert.equal((await db.get('SELECT name FROM containers WHERE id = 8')).name, 'Контейнер «Неизвестный»');
  assert.equal((await db.get("SELECT count(*) AS n FROM container_cars cc JOIN cars c ON c.id = cc.car_id WHERE cc.container_id = 8 AND c.country = 'Россия'")).n, 35);
  assert.equal((await db.get("SELECT count(*) AS n FROM container_cars cc JOIN cars c ON c.id = cc.car_id WHERE cc.container_id = 8 AND c.country = 'Великобритания'")).n, 0);
  assert.equal((await db.get("SELECT count(*) AS n FROM container_cars cc JOIN cars c ON c.id = cc.car_id WHERE cc.container_id = 9 AND c.country = 'Великобритания'")).n, 19);
});

test('динамическая цена: не выше базовой ($24 000 максимум), без ставок снижается, но не ниже 90 %', async () => {
  const room = await E.joinRoom(db, 2);
  const a = await db.get(`SELECT * FROM auctions WHERE room_id = :r AND status = 'active'`, { ':r': room });
  const p0 = a.initial_bid;
  await E.adminAdjust(db, 2, 2, 0 + 1, 'x', op()).catch(() => {});
  await db.run('UPDATE users SET is_admin = 1 WHERE id = 3');
  await E.adminAdjust(db, 3, 2, 2_000_000, 'x', op());
  await E.bid(db, 2, room, { amount: p0 * 6, opId: op() });
  await tick(31); await E.tick(db);
  const p1 = (await db.get('SELECT price FROM containers WHERE id = :c', { ':c': a.container_id })).price;
  // потолок — базовая цена (контейнер не дороже $24 000), даже после дорогих торгов
  assert.ok(p1 <= p0 && p1 <= 24_000, `${p0} → ${p1}`);
  // без ставок цена снижается, но не ниже 90 % базовой
  for (let i = 0; i < 12; i++) { await tick(9); await E.joinRoom(db, 2); await E.tick(db); await tick(31); await E.tick(db); }
  const rows = await db.all('SELECT c.price, m.base_price FROM containers c JOIN container_meta m ON m.container_id = c.id WHERE c.is_enabled = 1');
  assert.ok(rows.some((r) => r.price < r.base_price), 'хоть один контейнер подешевел');
  for (const r of rows) assert.ok(r.price >= r.base_price * 0.9 && r.price <= r.base_price, `${r.price} в пределах 90–100 % от ${r.base_price}`);
  await ok();
});

test('рынок: выставить, купить (деньги и машина одной операцией), снять', async () => {
  const [e1, e2] = (await db.all("SELECT id FROM cars WHERE rarity IN ('epic', 'mythic') AND is_active = 1 ORDER BY id LIMIT 2")).map((r) => r.id);
  const uc = await give(2, e1);
  const l = await G.listCar(db, 2, uc, 250_000);
  await assert.rejects(G.listCar(db, 2, uc, 200_000), /UNIQUE|uq_listing/i);
  await assert.rejects(G.buyListing(db, 2, l.id), { code: 'SELF_BUY' });
  await assert.rejects(G.buyListing(db, 3, l.id), { code: 'INSUFFICIENT_FUNDS' });
  await db.run('UPDATE users SET is_admin = 1 WHERE id = 4');
  await E.adminAdjust(db, 4, 3, 250_000, 'x', op());
  await G.buyListing(db, 3, l.id);
  assert.equal((await db.get('SELECT user_id FROM user_cars WHERE id = :i', { ':i': uc })).user_id, 3);
  assert.equal(await bal(2), 75_000 + 187_500, 'комиссия 25%');
  await assert.rejects(G.listCar(db, 2, await give(2, (await db.get("SELECT id FROM cars WHERE rarity = 'common' LIMIT 1")).id), 2_000), { code: 'MARKET_RARITY' }, 'обычные машины на рынок нельзя');
  const uc2 = await give(2, e2);
  const l2 = await G.listCar(db, 2, uc2, 9_999);
  await E.sellCar(db, 2, uc2);
  assert.equal((await db.get('SELECT status FROM market_listings WHERE id = :l', { ':l': l2.id })).status, 'cancelled', 'проданная государству снимается с рынка');
  await ok();
});

test('навык гонщика: 210 улучшений за $10 000 000, показатель 0,98 → 0,20', async () => {
  const v = await G.buySkill(db, 2, 10, op());
  assert.equal(v.purchases, 10);
  assert.equal(await bal(2), 75_000 - Array.from({ length: 10 }, (_, i) => skillPrice(i + 1)).reduce((a, b) => a + b));
  assert.equal(Array.from({ length: 210 }, (_, i) => skillPrice(i + 1)).reduce((a, b) => a + b), 10_000_000);
  assert.ok(Math.abs(reaction(0) - 0.98) < 1e-9 && reaction(210) === 0.2 && reaction(209) > reaction(210));
  assert.equal(v.level, 4);
  await db.run('UPDATE racer_skill SET purchases = 205 WHERE user_id = 2');
  await assert.rejects(G.buySkill(db, 2, 10, op()), { code: 'SKILL_MAX' });
  await ok();
});

test('Battle Pass: опыт за действия, бесплатная награда, премиум после покупки', async () => {
  await E.claimBonus(db, 2); // +100 XP
  await db.run(`UPDATE bp_progress SET xp = 5000 WHERE user_id = 2`);
  const r = await G.bpClaim(db, 2, 1, 'free');
  assert.equal(r.kind, 'money');
  await assert.rejects(G.bpClaim(db, 2, 1, 'free'), /UNIQUE|PRIMARY/i);
  await assert.rejects(G.bpClaim(db, 2, 6, 'free'), { code: 'BP_LOCKED' });
  await assert.rejects(G.bpClaim(db, 2, 1, 'premium'), { code: 'BP_NOT_PREMIUM' });
  await assert.rejects(G.bpBuy(db, 2), { code: 'STARS_ONLY' });
  const se = await G.currentSeason(db);
  const garage0 = (await db.get("SELECT count(*) AS n FROM user_cars WHERE user_id = 2 AND status = 'owned'")).n;
  await S.deliver(db, 2, { invoice_payload: `st:bp:2:${se.id}`, total_amount: 99, telegram_payment_charge_id: 'bp1' });
  assert.equal((await db.get("SELECT count(*) AS n FROM user_cars WHERE user_id = 2 AND status = 'owned'")).n, garage0 + 1, 'премиум сразу даёт машину сезона');
  const p = await G.bpClaim(db, 2, 4, 'premium');
  assert.equal(p.kind, 'container');
  const c = await G.bpClaim(db, 2, 5, 'premium');
  assert.equal(c.kind, 'car');
  assert.equal(c.car.rarity, 'rare');
  const v = await G.bpView(db, 2);
  assert.equal(v.levels.length, 15);
  assert.equal(v.levels[14].premium.kind, 'car');
  assert.equal(v.levels[14].premium.value, 2, 'на 15-м уровне — эпическая машина');
  assert.equal(v.prem_car.rarity, 'epic'); assert.equal(v.dx_car.rarity, 'mythic');
  await ok();
});

test('друзья и чужой профиль', async () => {
  await G.addFriend(db, 2, '@u3');
  const f = await G.friendsView(db, 2);
  assert.deepEqual(f.pick.map((x) => x.id), [3]);
  const p = await G.playerView(db, 2, 3);
  assert.equal(p.me, false);
  assert.equal(p.user.username, 'u3');
  assert.equal((await G.playerView(db, 2, 2)).me, true);
  assert.equal((await G.playerView(db, 3, 2)).is_friend, false);
  assert.equal((await G.playerView(db, 2, 3)).is_friend, true);
});
