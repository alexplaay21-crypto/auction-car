import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDb } from './db-shim.js';
import * as E from '../tgcloud/lib/engine.js';
import * as G from '../tgcloud/lib/engine3.js';

const schema = async (db) => (await db.all("SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name")).map((r) => r.type + ':' + r.name);

test('миграция 28: cars пересобрана без потерь, мистическая редкость работает', async () => {
  const db = makeDb(); E.dropSettingsCache();
  // база «как сейчас на сервере»: все миграции до 27
  await db.run('CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)');
  await db.run('INSERT INTO schema_migrations (id, applied_at) VALUES (28, 0), (29, 0), (30, 0), (31, 0)');
  await E.migrate(db);
  await E.ensureUser(db, { id: 2, username: 'u2' });
  await db.run(`INSERT INTO car_grants (op_id, user_id, car_id, source, created_at) VALUES ('g1', 2, 57, 'admin', (SELECT now FROM v_now))`);
  // старая схема: мистическую не записать
  await assert.rejects(db.run("UPDATE cars SET rarity = 'mystic' WHERE id = 57"));
  const before = await schema(db);
  const carsBefore = await db.all('SELECT * FROM cars ORDER BY id');
  const gBefore = await db.all('SELECT * FROM user_cars ORDER BY id');
  await db.run('DELETE FROM schema_migrations WHERE id = 28');
  assert.deepEqual(await E.migrate(db), [28]);
  await db.run('DELETE FROM schema_migrations WHERE id = 29');
  E.dropSettingsCache();
  assert.deepEqual(await schema(db), before, 'все таблицы, индексы, триггеры и представления на месте');
  assert.deepEqual(await db.all('SELECT * FROM cars ORDER BY id'), carsBefore, 'машины не изменились');
  assert.deepEqual(await db.all('SELECT * FROM user_cars ORDER BY id'), gBefore, 'гаражи не изменились');
  assert.deepEqual(await E.audit(db), []);
  await db.run('DELETE FROM schema_migrations WHERE id = 30');
  assert.deepEqual(await E.migrate(db), [29, 30]);
  assert.equal((await db.get('SELECT rarity FROM cars WHERE id = 16')).rarity, 'mystic', 'Mercedes-AMG One — мистическая');
  // мистическая: записывается, падает из контейнера с шансом, выставляется на рынок
  await db.run("UPDATE cars SET rarity = 'mystic' WHERE id = 57");
  const ch = await E.chances(db, 8);
  assert.equal(ch.mystic, 1); assert.equal(ch.mythic, 4);
  await db.run('UPDATE containers SET chance_common = 0, chance_rare = 0, chance_epic = 0, chance_mythic = 0, chance_mystic = 1000 WHERE id = 8');
  assert.equal(await E.rollCar(db, 8), 57);
  const uc = (await db.get('SELECT id FROM user_cars WHERE user_id = 2')).id;
  const l = await G.listCar(db, 2, uc, 1000);
  assert.ok(l.id);
});

test('у каждой машины трёхзначный номер: каталог из car_codes.js, остальные 900+, номера не повторяются', async () => {
  const { CAR_CODES } = await import('../tgcloud/lib/car_codes.js');
  const { worldIds } = await import('../tgcloud/lib/ddl8.js');
  for (let c = 1; c <= 8; c++) for (const id of worldIds(c)) assert.ok(CAR_CODES[id] >= c * 100 && CAR_CODES[id] < c * 100 + 100, `нет номера у машины ${id}`);
  const db = makeDb(); E.dropSettingsCache();
  await E.migrate(db);
  const rows = await db.all('SELECT id, code FROM cars');
  assert.ok(rows.every((r) => r.code >= 100 && r.code <= 999), 'все номера трёхзначные');
  assert.equal(new Set(rows.map((r) => r.code)).size, rows.length, 'номера не повторяются');
  for (const r of rows) if (CAR_CODES[r.id]) assert.equal(r.code, CAR_CODES[r.id]);
  assert.ok(rows.filter((r) => !CAR_CODES[r.id]).every((r) => r.code >= 900));
  await assert.rejects(db.run('UPDATE cars SET code = 1000 WHERE id = 1'));
});
