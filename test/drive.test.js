// Гонки, где игрок ведёт сам: симулятор детерминирован, сервер пересчитывает заезд по нажатиям,
// ставка в залоге, итог и выплаты — триггерами.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { makeDb, setClock } from './db-shim.js';
import * as E from '../tgcloud/lib/engine.js';
import * as G from '../tgcloud/lib/engine3.js';
import * as R from '../tgcloud/lib/engine_drive.js';
import * as D from '../tgcloud/lib/drive.js';
import fs from 'node:fs';

let db, clock = 0, seq = 0;
const op = () => `d${++seq}`;
const tick = async (s) => { clock += s; await setClock(db, clock); };
const bal = async (u) => (await E.getUser(db, u)).balance;
const ok = async () => assert.deepEqual(await E.audit(db), []);
const give = async (u, car) => {
  await db.run(`INSERT INTO car_grants (op_id, user_id, car_id, source, created_at) VALUES (:o, :u, :c, 'admin', (SELECT now FROM v_now))`, { ':o': op(), ':u': u, ':c': car });
  return (await db.get('SELECT id FROM user_cars WHERE user_id = :u ORDER BY id DESC LIMIT 1', { ':u': u })).id;
};
// «игрок» — ИИ-водитель, его нажатия записываются как у человека
function play(drive, a = 0.9) {
  const tr = D.buildTrack(drive.track, drive.seed);
  const cp = D.carParams(drive.car, drive.track, drive.reaction);
  const ai = D.aiDriver(drive.seed + 1, a), st = D.newState(tr), inputs = [];
  let last = -1;
  while (!st.finished && st.tick < tr.maxTicks) { const m = D.aiMask(tr, cp, st, ai); if (m !== last) { inputs.push([st.tick + 1, m]); last = m; } D.step(tr, cp, st, m); }
  return { inputs, ms: st.ms };
}

beforeEach(async () => {
  db = makeDb(); clock = 0; seq = 0; E.dropSettingsCache();
  await E.migrate(db);
  for (const n of [2, 3, 4]) await E.ensureUser(db, { id: n, username: 'u' + n });
});

test('симулятор: повтор по нажатиям даёт то же время; клиент использует тот же файл', () => {
  for (const track of ['drag', 'circuit', 'rally']) {
    const tr = D.buildTrack(track, 4242);
    const cp = D.carParams({ max_speed: 250, accel_x100: 600, power: 300, handling: 80, reliability: 85 }, track, 0.5);
    const ai = D.aiDriver(1, 0.8), st = D.newState(tr), inputs = [];
    let last = -1;
    while (!st.finished) { const m = D.aiMask(tr, cp, st, ai); if (m !== last) { inputs.push([st.tick + 1, m]); last = m; } D.step(tr, cp, st, m); }
    assert.equal(D.simulate(tr, cp, inputs).ms, st.ms, track);
    assert.ok(st.ms > 5000 && st.ms < 90000, `${track}: ${st.ms}`);
  }
  assert.equal(fs.readFileSync(new URL('../web/src/drive.js', import.meta.url), 'utf8'), fs.readFileSync(new URL('../tgcloud/lib/drive.js', import.meta.url), 'utf8'));
});

test('заезд с ботом: залог при старте, итог по пересчёту сервера, выплата', async () => {
  const uc = await give(2, 8);
  const d = await R.driveStart(db, 2, { mode: 'bot', carId: uc, track: 'drag', stake: 1000, opId: op() });
  assert.equal(await bal(2), 15_000 - 1000, 'ставка в залоге');
  const p = play(d);
  await assert.rejects(R.driveFinish(db, 2, { driveId: d.id, inputs: p.inputs }), { code: 'TOO_FAST' });
  await tick(30);
  await assert.rejects(R.driveFinish(db, 2, { driveId: d.id, inputs: [[5, 99]] }), { code: 'BAD_INPUT' });
  const f = await R.driveFinish(db, 2, { driveId: d.id, inputs: p.inputs });
  assert.equal(f.race.host_ms, p.ms, 'время — пересчёт сервера');
  const won = f.race.winner_id === 2;
  assert.equal(await bal(2), 15_000 + (won ? 900 : -1000));
  const again = await R.driveFinish(db, 2, { driveId: d.id, inputs: [] });
  assert.equal(again.race.id, f.race.id, 'повторная отправка ничего не меняет');
  const rp = await R.raceReplay(db, f.race.id);
  assert.equal(rp.host.inputs.length, p.inputs.length);
  assert.equal(rp.guest.kind, 'bot');
  await ok();
});

test('брошенный заезд: ставка сгорает, новый старт закрывает старый', async () => {
  const uc = await give(2, 8);
  await R.driveStart(db, 2, { mode: 'bot', carId: uc, track: 'circuit', stake: 2000, opId: op() });
  const d2 = await R.driveStart(db, 2, { mode: 'bot', carId: uc, track: 'circuit', stake: 1000, opId: op() });
  assert.equal(await bal(2), 15_000 - 3000);
  assert.equal((await db.get("SELECT count(*) AS n FROM drives WHERE status = 'expired'")).n, 1);
  await tick(700); await R.driveSweep(db, 2);
  const x = await R.driveFinish(db, 2, { driveId: d2.id, inputs: [] });
  assert.equal(x.drive.status, 'expired'); assert.equal(x.race, null);
  assert.equal(await bal(2), 15_000 - 3000);
  await ok();
});

test('вызов: автор едет первым, соперник — против его времени; банк победителю; занятый вызов возвращает залог', async () => {
  const uc = await give(2, 8), uc3 = await give(3, 16), uc4 = await give(4, 16);
  const h = await R.driveStart(db, 2, { mode: 'host', carId: uc, track: 'rally', stake: 2000, opId: op() });
  await tick(60);
  const hf = await R.driveFinish(db, 2, { driveId: h.id, inputs: play(h).inputs });
  assert.equal(hf.race.status, 'open');
  assert.equal(await bal(2), 13_000);
  const g = await R.driveStart(db, 3, { mode: 'guest', carId: uc3, raceId: hf.race.id, opId: op() });
  assert.equal(g.seed, h.seed, 'та же трасса');
  assert.equal(g.rival.kind, 'player');
  assert.equal(g.rival.inputs.length, play(h).inputs.length, 'призрак автора');
  const g4 = await R.driveStart(db, 4, { mode: 'guest', carId: uc4, raceId: hf.race.id, opId: op() });
  await assert.rejects(R.driveStart(db, 2, { mode: 'guest', carId: uc, raceId: hf.race.id, opId: op() }), { code: 'SELF_RACE' });
  await tick(60);
  const gf = await R.driveFinish(db, 3, { driveId: g.id, inputs: play(g, 0.6).inputs });
  assert.equal(gf.race.status, 'done');
  const w = gf.race.winner_id;
  assert.equal(await bal(w), (w === 2 ? 13_000 : 13_000) + 3800, 'банк 4000 минус 5%');
  const f4 = await R.driveFinish(db, 4, { driveId: g4.id, inputs: play(g4).inputs });
  assert.equal(f4.race, null);
  assert.equal(await bal(4), 15_000, 'вызов уже принят — залог вернулся');
  const c = await R.driveStart(db, 2, { mode: 'host', carId: uc, track: 'drag', stake: 500, opId: op() });
  await tick(60);
  const cf = await R.driveFinish(db, 2, { driveId: c.id, inputs: play(c).inputs });
  const b2 = await bal(2);
  await G.raceCancel(db, 2, cf.race.id);
  assert.equal(await bal(2), b2 + 500, 'отменённый вызов возвращает залог');
  await assert.rejects(R.driveStart(db, 3, { mode: 'guest', carId: uc3, raceId: cf.race.id, opId: op() }), { code: 'RACE_CLOSED' });
  await ok();
});
