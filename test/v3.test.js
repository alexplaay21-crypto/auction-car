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

test('8 стран, у каждого контейнера флаг; в немецком 50 машин (30/14/4/2)', async () => {
  assert.equal((await db.get('SELECT count(*) AS n FROM containers')).n, 8);
  assert.equal((await db.get('SELECT count(*) AS n FROM cars')).n, 64 + 42 * 4);
  const de = await db.all("SELECT c.rarity, count(*) AS n FROM container_cars cc JOIN cars c ON c.id = cc.car_id WHERE cc.container_id = 2 GROUP BY c.rarity ORDER BY c.rarity");
  assert.deepEqual(Object.fromEntries(de.map((r) => [r.rarity, r.n])), { common: 30, epic: 4, mythic: 2, rare: 14 });
  const flags = (await db.all('SELECT flag FROM container_meta ORDER BY container_id')).map((r) => r.flag);
  assert.deepEqual(flags, ['jp', 'de', 'us', 'it', 'ru', 'cn', 'fr', 'world']);
  for (let c = 1; c <= 8; c++) assert.equal((await db.get('SELECT count(*) AS n FROM container_cars WHERE container_id = :c', { ':c': c })).n, [1, 2, 3, 7].includes(c) ? 50 : 8);
});

test('динамическая цена: дорогие торги поднимают стартовую цену, пустые — снижают (не больше 10% за раз)', async () => {
  const room = await E.joinRoom(db, 2);
  const a = await db.get(`SELECT * FROM auctions WHERE room_id = :r AND status = 'active'`, { ':r': room });
  const p0 = a.initial_bid;
  await E.adminAdjust(db, 2, 2, 0 + 1, 'x', op()).catch(() => {});
  await db.run('UPDATE users SET is_admin = 1 WHERE id = 3');
  await E.adminAdjust(db, 3, 2, 200_000, 'x', op());
  await E.bid(db, 2, room, { amount: p0 * 6, opId: op() });
  await tick(31); await E.tick(db);
  const p1 = (await db.get('SELECT price FROM containers WHERE id = :c', { ':c': a.container_id })).price;
  assert.ok(p1 > p0 && p1 <= p0 * 1.1, `${p0} → ${p1}`);
  const cp = await G.containerPrices(db);
  assert.ok(cp.find((x) => x.id === a.container_id).change > 0);
  await ok();
});

test('рынок: выставить, купить (деньги и машина одной операцией), снять', async () => {
  const uc = await give(2, 8);
  const l = await G.listCar(db, 2, uc, 50_000);
  await assert.rejects(G.listCar(db, 2, uc, 40_000), /UNIQUE|uq_listing/i);
  await assert.rejects(G.buyListing(db, 2, l.id), { code: 'SELF_BUY' });
  await assert.rejects(G.buyListing(db, 3, l.id), { code: 'INSUFFICIENT_FUNDS' });
  await db.run('UPDATE users SET is_admin = 1 WHERE id = 4');
  await E.adminAdjust(db, 4, 3, 50_000, 'x', op());
  await G.buyListing(db, 3, l.id);
  assert.equal((await db.get('SELECT user_id FROM user_cars WHERE id = :i', { ':i': uc })).user_id, 3);
  assert.equal(await bal(2), 15_000 + 37_500, 'комиссия 25%');
  await assert.rejects(G.listCar(db, 2, await give(2, 1), 2_000), { code: 'MARKET_RARITY' }, 'обычные машины на рынок нельзя');
  const uc2 = await give(2, 6);
  const l2 = await G.listCar(db, 2, uc2, 9_999);
  await E.sellCar(db, 2, uc2);
  assert.equal((await db.get('SELECT status FROM market_listings WHERE id = :l', { ':l': l2.id })).status, 'cancelled', 'проданная государству снимается с рынка');
  await ok();
});

test('гонка с ботом: ставка и выплата; вызов игроку: залог и банк победителю', async () => {
  const uc = await give(2, 8);
  const r = await G.raceBot(db, 2, { carId: uc, track: 'drag', stake: 1000, opId: op() });
  assert.equal(await bal(2), 15_000 + (r.winner_id === 2 ? 900 : -1000));
  const c = await G.raceCreate(db, 2, { carId: uc, track: 'circuit', stake: 2000, opId: op() });
  const before = await bal(2);
  const uc3 = await give(3, 16);
  const done = await G.raceAccept(db, 3, c.id, uc3);
  const w = done.winner_id;
  assert.ok([2, 3].includes(w));
  assert.equal(await bal(w === 2 ? 2 : 3), (w === 2 ? before : 15_000 - 2000) + 3800, 'банк 4000 минус 5%');
  const c2 = await G.raceCreate(db, 2, { carId: uc, track: 'rally', stake: 500, opId: op() });
  const b2 = await bal(2);
  await G.raceCancel(db, 2, c2.id);
  assert.equal(await bal(2), b2 + 500, 'отменённый вызов возвращает залог');
  await assert.rejects(G.raceAccept(db, 3, c2.id, uc3), { code: 'RACE_CLOSED' });
  await ok();
});

test('навык гонщика: 210 улучшений за $2 000 000, показатель 0,98 → 0,20', async () => {
  const v = await G.buySkill(db, 2, 10, op());
  assert.equal(v.purchases, 10);
  assert.equal(await bal(2), 15_000 - Array.from({ length: 10 }, (_, i) => skillPrice(i + 1)).reduce((a, b) => a + b));
  assert.equal(Array.from({ length: 210 }, (_, i) => skillPrice(i + 1)).reduce((a, b) => a + b), 2_000_000);
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
