import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { makeDb, setClock } from './db-shim.js';
import * as E from '../tgcloud/lib/engine.js';
import * as S from '../tgcloud/lib/stars.js';

let db, clock = 0, seq = 0;
const op = () => `t${++seq}`;
const tick = async (s) => { clock += s; await setClock(db, clock); };
const bal = async (u) => (await E.getUser(db, u)).balance;
const ok = async () => assert.deepEqual(await E.audit(db), []);
const active = (room) => db.get(`SELECT * FROM auctions WHERE room_id = :r AND status = 'active'`, { ':r': room });

beforeEach(async () => {
  db = makeDb(); clock = 0; seq = 0;
  E.dropSettingsCache();
  await E.migrate(db);
  await E.ensureUser(db, { id: 1, username: 'admin' }, { admin: true });
  for (const n of [2, 3, 4]) await E.ensureUser(db, { id: n, username: 'u' + n });
});

test('регистрация: стартовые $15 000, гараж на 15 мест, реферальные бонусы', async () => {
  assert.equal(await bal(2), 15_000);
  assert.equal((await E.getUser(db, 2)).garage_capacity, 15);
  await E.ensureUser(db, { id: 10, username: 'inv' }, { ref: 2 });
  assert.equal(await bal(2), 25_000);
  assert.equal(await bal(10), 20_000);
  await E.ensureUser(db, { id: 11 }, { ref: 999 }); // несуществующий пригласивший — просто регистрация
  assert.equal(await bal(11), 15_000);
  await ok();
});

test('аукцион: залог, возврат перебитому, таймер сбрасывается, победитель получает машину', async () => {
  const room = await E.joinRoom(db, 2);
  assert.equal(await E.joinRoom(db, 3), room, 'второй игрок в ту же комнату');
  const a = await active(room);
  assert.ok(a, 'контейнер запущен');
  await assert.rejects(E.bid(db, 2, room, { amount: a.initial_bid, opId: op() }), { code: 'BID_TOO_LOW' });
  await E.bid(db, 2, room, { amount: a.initial_bid + 500, opId: op() });
  assert.equal(await bal(2), 15_000 - a.initial_bid - 500);
  await tick(20);
  await E.bid(db, 3, room, { raise: 1000, opId: op() });
  assert.equal(await bal(2), 15_000, 'перебитому вернули залог');
  assert.equal(await bal(3), 15_000 - a.initial_bid - 1500);
  await E.bid(db, 3, room, { raise: 500, opId: op() }); // лидер повышает — доплачивает разницу
  assert.equal(await bal(3), 15_000 - a.initial_bid - 2000);
  await tick(20);
  assert.equal(await E.tick(db), 0, 'таймер сбросился после ставки: ещё рано');
  await tick(11);
  assert.ok(await E.tick(db) >= 1);
  const done = await db.get('SELECT * FROM auctions WHERE id = :a', { ':a': a.id });
  assert.equal(done.status, 'won');
  assert.equal(done.leader_id, 3);
  const car = await db.get(`SELECT * FROM user_cars WHERE source = 'auction' AND source_ref = :a`, { ':a': a.id });
  assert.equal(car.user_id, 3);
  assert.equal(car.status, 'owned');
  assert.equal((await E.getUser(db, 3)).wins, 1);
  await assert.rejects(E.bid(db, 2, room, { raise: 500, opId: op() }), { code: 'AUCTION_OVER' }, 'пауза между контейнерами');
  await tick(5);
  await E.tick(db);
  assert.ok(await active(room), 'после паузы — следующий контейнер');
  await ok();
});

test('кик после двух контейнеров без ставок, пустая комната закрывается', async () => {
  const room = await E.joinRoom(db, 2);
  for (let i = 0; i < 2; i++) {
    await tick(31); await E.tick(db); // контейнер без ставок
    await tick(5); await E.tick(db);  // следующий
    if (i === 0) assert.equal((await db.get('SELECT left_at FROM room_members WHERE room_id = :r AND user_id = 2', { ':r': room })).left_at, null, 'после одного пропуска ещё в комнате');
  }
  const m = await db.get('SELECT * FROM room_members WHERE room_id = :r AND user_id = 2', { ':r': room });
  assert.ok(m.left_at && m.kicked === 1);
  assert.equal((await db.get('SELECT status FROM rooms WHERE id = :r', { ':r': room })).status, 'closed');
  assert.equal(await bal(2), 15_000);
  await ok();
});

test('полный гараж: машина продаётся сразу; продажа и расширение гаража', async () => {
  await db.run('UPDATE users SET garage_capacity = 1 WHERE id = 2');
  await db.run(`INSERT INTO user_containers (user_id, container_id, qty) VALUES (2, 1, 2)`);
  const o1 = await E.openContainer(db, 2, 1, op());
  const c1 = await db.get(`SELECT * FROM user_cars WHERE source = 'open' AND source_ref = :i`, { ':i': o1.id });
  assert.equal(c1.status, 'owned');
  const before = await bal(2);
  const o2 = await E.openContainer(db, 2, 1, op());
  const c2 = await db.get(`SELECT uc.*, c.price FROM user_cars uc JOIN cars c ON c.id = uc.car_id WHERE source = 'open' AND source_ref = :i`, { ':i': o2.id });
  assert.equal(c2.status, 'sold');
  assert.equal(await bal(2), before + Math.floor(c2.price * 0.9), 'авто-продажа с комиссией 10%');
  await assert.rejects(E.openContainer(db, 2, 1, op()), { code: 'NO_CONTAINER' });
  // быстрая продажа (10%) в первые 15 минут, потом — государству (40%)
  const q = await E.sellRate(db, 2, c1.id);
  assert.equal(q.quick, true);
  await tick(901);
  const s = await E.sellRate(db, 2, c1.id);
  assert.equal(s.rate, 4000);
  await E.sellCar(db, 2, c1.id);
  await assert.rejects(E.sellCar(db, 2, c1.id), { code: 'CAR_NOT_FOUND' });
  await db.run('UPDATE users SET garage_capacity = 15, balance = balance WHERE id = 2');
  await E.adminAdjust(db, 1, 2, 100_000, 'test', op());
  const t = await E.upgradeGarage(db, 2);
  assert.equal(t.capacity, 20);
  assert.equal((await E.getUser(db, 2)).garage_capacity, 20);
  await ok();
});

test('VIP: +10 мест, меньше комиссии, двойной бонус; переводы и бонус раз в 4 часа', async () => {
  await assert.rejects(E.buyVip(db, 2), { code: 'STARS_ONLY' }, 'VIP только за звёзды');
  await S.deliver(db, 2, { invoice_payload: 'st:vip:2:0', total_amount: 199, telegram_payment_charge_id: 'vip1' });
  const u = await E.getUser(db, 2);
  assert.equal(u.is_vip, 1);
  assert.equal(u.garage_capacity, 25);
  await assert.rejects(S.invoiceParams(db, 2, 'vip'), { code: 'ALREADY_VIP' });
  const b = await E.claimBonus(db, 2);
  assert.equal(b.amount, 10_000, 'VIP: $10 000 раз в 4 часа');
  await assert.rejects(E.claimBonus(db, 2), { code: 'BONUS_TOO_EARLY' });
  await E.adminAdjust(db, 1, 2, 100_000, 'rich', 'r1');
  await setClock(db, 14_400);
  await assert.rejects(E.claimBonus(db, 2), { code: 'BONUS_RICH' }, 'при балансе от $100 000 у VIP бонуса нет');
  assert.equal((await E.claimBonus(db, 3)).amount, 5_000);
  const t1 = await E.transfer(db, 3, '@u4', 1000, op());
  assert.equal(t1.net, 900, 'обычный игрок — комиссия 10%');
  const t2 = await E.transfer(db, 2, '4', 1000, op());
  assert.equal(t2.net, 1000, 'VIP — без комиссии');
  await assert.rejects(E.transfer(db, 3, 'nobody', 10, op()), { code: 'RECIPIENT_NOT_FOUND' });
  await ok();
});

test('продажа машины игроку: деньги и машина меняются одной операцией', async () => {
  await db.run(`INSERT INTO car_grants (op_id, user_id, car_id, source, created_at) VALUES ('g1', 2, 8, 'admin', (SELECT now FROM v_now))`);
  const uc = await db.get(`SELECT * FROM user_cars WHERE user_id = 2`);
  const o = await E.offerCar(db, 2, uc.id, '@u3', 10_000);
  await assert.rejects(E.offerCar(db, 2, uc.id, '@u4', 9_000), { code: 'OFFER_EXISTS' });
  await assert.rejects(E.answerOffer(db, 4, o.id, true), { code: 'OFFER_NOT_FOUND' });
  await E.answerOffer(db, 3, o.id, true);
  assert.equal((await db.get('SELECT user_id FROM user_cars WHERE id = :i', { ':i': uc.id })).user_id, 3);
  assert.equal(await bal(3), 5_000);
  assert.equal(await bal(2), 15_000 + 7_500, 'комиссия 25%');
  await assert.rejects(db.run('UPDATE user_cars SET user_id = 4 WHERE id = :i', { ':i': uc.id }), /BAD_CAR_UPDATE/);
  await ok();
});

test('промокод и магазин', async () => {
  await db.run(`INSERT INTO promo_codes (code, money, container_id, container_qty, max_uses, created_by, created_at) VALUES ('START', 2000, 2, 1, 1, 1, 0)`);
  await E.redeemPromo(db, 2, 'start');
  assert.equal(await bal(2), 17_000);
  await assert.rejects(E.redeemPromo(db, 2, 'START'), { code: 'PROMO_LIMIT' });
  await assert.rejects(E.redeemPromo(db, 3, 'START'), { code: 'PROMO_LIMIT' });
  assert.equal((await db.get('SELECT qty FROM user_containers WHERE user_id = 2 AND container_id = 2')).qty, 1);
  await db.run(`INSERT INTO shop_lots (title, price, container_id, container_qty) VALUES ('3 немецких', 12000, 2, 3)`);
  await E.buyLot(db, 3, 1, op());
  assert.equal(await bal(3), 3_000);
  assert.equal((await db.get('SELECT qty FROM user_containers WHERE user_id = 3 AND container_id = 2')).qty, 3);
  await ok();
});

test('нельзя ставить, не войдя в комнату, и нельзя завершить контейнер раньше времени', async () => {
  const room = await E.joinRoom(db, 2);
  await assert.rejects(E.bid(db, 3, room, { raise: 500, opId: op() }), { code: 'NOT_IN_ROOM' });
  const a = await active(room);
  await assert.rejects(db.run(`UPDATE auctions SET status = 'no_bids', ended_at = (SELECT now FROM v_now) WHERE id = :a`, { ':a': a.id }), /NOT_FINISHED/);
  const same = op();
  await E.bid(db, 2, room, { raise: 500, opId: same });
  const r = await E.bid(db, 2, room, { raise: 500, opId: same });
  assert.equal(r.replay, true, 'повтор того же нажатия не списывает дважды');
  assert.equal(await bal(2), 15_000 - a.initial_bid - 500);
  await ok();
});
