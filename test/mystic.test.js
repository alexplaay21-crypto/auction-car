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
  await db.run('INSERT INTO schema_migrations (id, applied_at) VALUES (28, 0), (29, 0), (30, 0), (31, 0), (32, 0), (33, 0), (34, 0), (35, 0)');
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
  await db.run('DELETE FROM schema_migrations WHERE id >= 30');
  assert.deepEqual(await E.migrate(db), [29, 30, 31, 32, 33, 34, 35]);
  // мистическая: записывается, падает из контейнера с шансом, выставляется на рынок
  await db.run("UPDATE cars SET rarity = 'epic' WHERE rarity = 'mystic'");
  await db.run("UPDATE cars SET rarity = 'mystic' WHERE id = 57"); // единственная мистическая в контейнере
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

test('эксклюзив с тиражом: когда выдан весь тираж, машина больше не выпадает', async () => {
  const db = makeDb(); E.dropSettingsCache();
  await E.migrate(db);
  await E.ensureUser(db, { id: 2, username: 'u2' });
  const car = (await db.get("SELECT c.id FROM cars c JOIN container_cars cc ON cc.car_id = c.id WHERE cc.container_id = 8 AND c.rarity = 'mystic' LIMIT 1")).id;
  await db.run("UPDATE cars SET rarity = 'epic' WHERE rarity = 'mystic' AND id <> :c", { ':c': car });
  await db.run('UPDATE containers SET chance_common = 0, chance_rare = 0, chance_epic = 0, chance_mythic = 0, chance_mystic = 1000 WHERE id = 8');
  await db.run('UPDATE cars SET exclusive = 1, edition = 1 WHERE id = :c', { ':c': car });
  assert.equal(await E.rollCar(db, 8), car);
  await db.run(`INSERT INTO car_grants (op_id, user_id, car_id, source, created_at) VALUES ('x1', 2, :c, 'admin', (SELECT now FROM v_now))`, { ':c': car });
  assert.notEqual(await E.rollCar(db, 8), car, 'тираж выдан — больше не выпадает');
  assert.equal((await E.chances(db, 8)).mystic, 0, 'и шанс мистической в контейнере теперь 0');
});

test('машины сезона Battle Pass после пересчёта: премиум — эпическая, делюкс — легендарная, не пустые', async () => {
  const db = makeDb(); E.dropSettingsCache();
  await E.migrate(db);
  const s = await db.all('SELECT b.prem_car_id, b.dx_car_id, p.rarity AS pr, d.rarity AS dr FROM bp_seasons b LEFT JOIN cars p ON p.id = b.prem_car_id LEFT JOIN cars d ON d.id = b.dx_car_id');
  for (const x of s) {
    if (x.prem_car_id != null) assert.equal(x.pr, 'epic');
    if (x.dx_car_id != null) assert.equal(x.dr, 'mythic');
  }
});

test('экономика: контейнер не «печатает» деньги — старт не ниже средней машины × 0,9 даже после торгов без ставок', async () => {
  const db = makeDb(); E.dropSettingsCache();
  await E.migrate(db);
  const { buildCountry, CONTAINER_EXTRA, CHANCES } = await import('../tgcloud/lib/catalog_world.js');
  for (const c of [1, 2, 3, 4, 6, 7, 8]) {
    const cars = [c, ...(CONTAINER_EXTRA[c] ?? [])].flatMap((x) => buildCountry(x));
    const by = {}; for (const x of cars) (by[x[2]] ??= []).push(x[8]);
    const tot = Object.keys(by).reduce((s, r) => s + CHANCES[r], 0);
    const ev = Object.keys(by).reduce((s, r) => s + (CHANCES[r] / tot) * (by[r].reduce((a, b) => a + b, 0) / by[r].length), 0);
    const ct = await db.get('SELECT c.price, m.base_price FROM containers c JOIN container_meta m ON m.container_id = c.id WHERE c.id = :c', { ':c': c });
    assert.ok(Math.abs(ct.price - ev) <= 500, `контейнер ${c}: цена ${ct.price} ≈ средняя машина ${Math.round(ev)}`);
    // быстрая продажа (−10 %) средней машины не окупает даже нижний порог цены (90 %) с запасом
    assert.ok(ct.base_price * 0.9 >= ev * 0.9 - 500);
  }
  assert.equal((await db.get("SELECT v FROM settings WHERE k = 'price_floor_pct'")).v, 90);
});
