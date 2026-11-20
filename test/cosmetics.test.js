import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { makeDb } from './db-shim.js';
import * as E from '../tgcloud/lib/engine.js';
import * as C from '../tgcloud/lib/cosmetics.js';

let db;
beforeEach(async () => {
  db = makeDb(); E.dropSettingsCache();
  await E.migrate(db);
  await E.ensureUser(db, { id: 2, username: 'u2' });
  await E.ensureUser(db, { id: 1, username: 'adm' }, { admin: true });
});

test('нельзя купить без денег', async () => {
  await assert.rejects(C.buyCosmetic(db, 2, 'goldrush'), { code: 'INSUFFICIENT_FUNDS' });
  const v = await C.cosmeticsView(db, 2);
  assert.ok(v.items.filter((i) => i.kind === 'bg').length >= 6 && v.items.filter((i) => i.kind === 'frame').length >= 6);
  assert.equal(v.bg, null);
});

test('покупка и надевание', async () => {
  await E.adminAdjust(db, 1, 2, 2_500_000, 'test', 'a1');
  const b0 = (await E.getUser(db, 2)).balance;
  let v = await C.buyCosmetic(db, 2, 'neon');
  assert.equal(v.bg, 'neon');
  assert.equal(v.balance, b0 - 375_000);
  await assert.rejects(C.buyCosmetic(db, 2, 'neon'), { code: 'ALREADY_OWNED' });
  v = await C.buyCosmetic(db, 2, 'fire');
  assert.equal(v.frame, 'fire');
  await assert.rejects(C.equipCosmetic(db, 2, 'gold'), { code: 'NOT_OWNED' });
  v = await C.equipCosmetic(db, 2, null, 'bg');
  assert.equal(v.bg, null);
  v = await C.equipCosmetic(db, 2, 'neon');
  assert.equal(v.bg, 'neon');
  assert.deepEqual(await E.audit(db), []);
});

test('эпическая машина за каждых 5 друзей', async () => {
  assert.equal((await E.settings(db)).ref_epic_every, 5);
  for (let i = 10; i < 15; i++) await E.ensureUser(db, { id: i, username: 'f' + i }, { ref: '2' });
  assert.equal(await E.referralRewards(db, 2), 1);
  const car = await db.get(`SELECT c.rarity FROM car_grants g JOIN cars c ON c.id = g.car_id WHERE g.user_id = 2 AND g.source = 'referral'`);
  assert.equal(car.rarity, 'epic');
});
