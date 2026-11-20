// lib/engine_drive.js — заезды, которыми игрок управляет сам (физика — lib/drive.js, деньги — триггеры lib/ddl9.js).
// start  — ставка в залог, seed трассы; для бота сразу считается его время (тот же симулятор с «водителем»-ИИ).
// finish — сервер пересчитывает заезд по нажатиям; бот: итог сразу; вызов: появляется открытый вызов;
//          принятие: итог против времени автора (если вызов уже принял другой — залог возвращается).
// Брошенный заезд (больше 10 минут) или новый старт поверх незаконченного — ставка сгорает.
import { GameError, toGameError, settings, now } from './engine.js';
import { pickBot } from './race.js';
import { reaction } from './ddl3.js';
import { DNF } from './ddl9.js';
import { raceView, skillOf } from './engine3.js';
import * as D from './drive.js';

const NOW = '(SELECT now FROM v_now)';
const CAR_COLS = 'id, name, rarity, color, body, max_speed, accel_x100, power, handling, reliability, price, country';
async function exec(db, q, p) { try { return await db.run(q, p); } catch (e) { throw toGameError(e) ?? e; } }
const intOf = (v, min, max) => {
  const n = Math.floor(Number(v));
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new GameError('BAD_AMOUNT');
  return n;
};

// бот: машина близкой цены, «водитель» 0,55 … 0,9; его время — тот же симулятор
export function botRun(botCar, track, seed, a) {
  const tr = D.buildTrack(track, seed);
  const st = D.simulateAi(tr, D.carParams(botCar, track, 0.5), D.aiDriver(seed, a));
  return st.finished ? st.ms : DNF;
}

// незаконченные заезды игрока сгорают; если в принятый вызов уже успел приехать другой — залог возвращается
async function closeStale(db, uid, all) {
  await db.run(`UPDATE drives SET status = CASE WHEN mode = 'guest' AND NOT EXISTS (SELECT 1 FROM races WHERE id = drives.race_id AND status = 'open')
      THEN 'refunded' ELSE 'expired' END, finished_at = ${NOW}
    WHERE user_id = :u AND status = 'driving' AND (:all = 1 OR created_at < ${NOW} - 600)`, { ':u': uid, ':all': all ? 1 : 0 });
}

async function driveView(db, d) {
  const car = await db.get(`SELECT ${CAR_COLS} FROM cars WHERE id = :c`, { ':c': d.car_id });
  const out = { id: d.id, mode: d.mode, track: d.track, seed: d.seed, stake: d.stake, reaction: d.reaction_x1000 / 1000, status: d.status, car, ms: d.ms, race_id: d.race_id };
  if (d.mode === 'bot') out.rival = { kind: 'bot', car: await db.get(`SELECT ${CAR_COLS} FROM cars WHERE id = :c`, { ':c': d.bot_car }), a: d.bot_a / 1000, reaction: 0.5 };
  if (d.mode === 'guest') out.rival = await ghostOf(db, d.race_id, 'host');
  return out;
}

// «призрак» — чужой заезд для повтора: машина, навык и нажатия (или параметры бота)
async function ghostOf(db, raceId, side) {
  const r = await db.get('SELECT * FROM races WHERE id = :r', { ':r': raceId });
  if (!r?.held) return null;
  if (side === 'guest' && r.kind === 'bot') {
    const hd = await db.get('SELECT bot_car, bot_a FROM drives WHERE id = :d', { ':d': r.host_drive });
    return { kind: 'bot', car: await db.get(`SELECT ${CAR_COLS} FROM cars WHERE id = :c`, { ':c': hd.bot_car }), a: hd.bot_a / 1000, reaction: 0.5, ms: r.guest_ms };
  }
  const d = await db.get('SELECT * FROM drives WHERE id = :d', { ':d': side === 'host' ? r.host_drive : r.guest_drive });
  if (!d) return null;
  const u = await db.get('SELECT id, username, first_name FROM users WHERE id = :u', { ':u': d.user_id });
  return { kind: 'player', user: u, car: await db.get(`SELECT ${CAR_COLS} FROM cars WHERE id = :c`, { ':c': d.car_id }), reaction: d.reaction_x1000 / 1000, inputs: JSON.parse(d.inputs || '[]'), ms: d.ms };
}

export async function driveStart(db, uid, { mode, carId, track, stake, raceId, opId }) {
  if (!['bot', 'host', 'guest'].includes(mode)) throw new GameError('BAD_INPUT');
  const op = `drive:${uid}:${opId}`;
  const done = await db.get('SELECT * FROM drives WHERE op_id = :op', { ':op': op });
  if (done) return driveView(db, done);
  const st = await settings(db);
  const car = await db.get(
    `SELECT uc.id AS user_car_id, c.* FROM user_cars uc JOIN cars c ON c.id = uc.car_id WHERE uc.id = :i AND uc.user_id = :u AND uc.status = 'owned'`,
    { ':i': Number(carId) || 0, ':u': uid });
  if (!car) throw new GameError('CAR_NOT_FOUND');
  let tr = track, s, seed, race = null;
  if (mode === 'guest') {
    race = await db.get(`SELECT * FROM races WHERE id = :r AND status = 'open' AND held = 1`, { ':r': Number(raceId) || 0 });
    if (!race) throw new GameError('RACE_CLOSED');
    if (race.host_id === uid) throw new GameError('SELF_RACE');
    tr = race.track; s = race.stake; seed = race.seed;
  } else {
    if (!D.DTRACKS[tr]) throw new GameError('BAD_TRACK');
    s = intOf(stake, st.race_min_stake, st.race_max_stake);
    seed = 1 + Math.floor(Math.random() * 2_000_000_000);
  }
  await closeStale(db, uid, true);
  const react = Math.round(reaction(await skillOf(db, uid)) * 1000);
  let bot = { car: null, a: null, ms: null };
  if (mode === 'bot') {
    const cars = await db.all('SELECT * FROM cars WHERE is_active = 1');
    const b = pickBot(cars, car).car;
    const a = Math.round((0.55 + Math.random() * 0.35) * 1000);
    bot = { car: b.id, a, ms: botRun(b, tr, seed, a / 1000) };
  }
  const r = await exec(db,
    `INSERT INTO drives (op_id, user_id, user_car, car_id, mode, race_id, track, stake, seed, reaction_x1000, bot_car, bot_a, bot_ms, status, created_at)
     VALUES (:op, :u, :uc, :c, :m, :r, :t, :s, :seed, :re, :bc, :ba, :bm, 'driving', ${NOW})`,
    { ':op': op, ':u': uid, ':uc': car.user_car_id, ':c': car.id, ':m': mode, ':r': race?.id ?? null, ':t': tr, ':s': s, ':seed': seed, ':re': react,
      ':bc': bot.car, ':ba': bot.a, ':bm': bot.ms });
  return driveView(db, await db.get('SELECT * FROM drives WHERE id = :i', { ':i': r.lastInsertRowid }));
}

export async function driveFinish(db, uid, { driveId, inputs }) {
  const d = await db.get('SELECT * FROM drives WHERE id = :i AND user_id = :u', { ':i': Number(driveId) || 0, ':u': uid });
  if (!d) throw new GameError('DRIVE_CLOSED');
  if (d.status !== 'driving') return finishedView(db, d);
  const tr = D.buildTrack(d.track, d.seed);
  if (!D.validInputs(inputs, tr.maxTicks)) throw new GameError('BAD_INPUT');
  const car = await db.get('SELECT * FROM cars WHERE id = :c', { ':c': d.car_id });
  const st = D.simulate(tr, D.carParams(car, d.track, d.reaction_x1000 / 1000), inputs);
  const ms = st.finished ? st.ms : DNF;
  // нажатия нельзя прислать быстрее, чем шёл заезд
  if (st.finished && (await now(db)) - d.created_at < (tr.green / D.TICK + ms / 1000) * 0.85 - 3) throw new GameError('TOO_FAST');
  // итог (запись в races, выплаты, возврат залога) делают триггеры drives_done / races_*
  await exec(db, `UPDATE drives SET status = 'done', ms = :ms, hits = :h, inputs = :in, finished_at = ${NOW} WHERE id = :i AND status = 'driving'`,
    { ':ms': ms, ':h': st.hits, ':in': JSON.stringify(inputs), ':i': d.id });
  if (d.mode === 'guest') {
    const r = await db.get(`SELECT id, host_id FROM races WHERE guest_drive = :d`, { ':d': d.id });
    if (r) await db.run(`INSERT INTO outbox (chat_id, kind, ref, created_at) VALUES (:c, 'race', :r, ${NOW})`, { ':c': r.host_id, ':r': r.id });
  }
  return finishedView(db, await db.get('SELECT * FROM drives WHERE id = :i', { ':i': d.id }));
}

async function finishedView(db, d) {
  const race = await db.get('SELECT id FROM races WHERE host_drive = :d OR guest_drive = :d', { ':d': d.id });
  return { drive: { id: d.id, mode: d.mode, status: d.status, ms: d.ms === DNF ? null : d.ms, hits: d.hits }, race: race ? await raceView(db, race.id) : null };
}

// повтор заезда из истории: обе стороны с нажатиями
export async function raceReplay(db, raceId) {
  const r = await db.get('SELECT * FROM races WHERE id = :r', { ':r': Number(raceId) || 0 });
  if (!r?.held) throw new GameError('NO_REPLAY');
  return { race: await raceView(db, r.id), seed: r.seed, track: r.track, host: await ghostOf(db, r.id, 'host'), guest: r.status === 'done' ? await ghostOf(db, r.id, 'guest') : null };
}

export async function driveSweep(db, uid) { await closeStale(db, uid, false); }
