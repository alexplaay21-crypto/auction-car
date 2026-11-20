// lib/drive.js — заезд, которым игрок управляет сам. Один и тот же код работает в Mini App
// (игра в реальном времени) и на сервере (сервер пересчитывает заезд по записанным нажатиям
// и сам определяет время — подделать результат нельзя).
// Только детерминированная арифметика (+ − × ÷ √, целочисленный ГСЧ): без sin/exp/log,
// чтобы на любом телефоне и на сервере получалось одно и то же.
//
// Трассы:
//  drag    — 402 м по прямой: держи обороты на старте, переключай передачи в зелёной зоне, нитро.
//  circuit — кольцо с поворотами и медленными машинами: руль, тормоз перед поворотом, нитро.
//  ralli   — грунт (сцепление хуже), крутые повороты и камни на дороге.
// Характеристики машины: скорость — максималка, разгон — ускорение, мощность — сила нитро,
// управление — сцепление в повороте, руль и тормоза, надёжность — потери при вылете и ударах.
// Навык гонщика — задержка старта (реакция).

export const TICK = 60;                     // шагов в секунду
export const HALF = 3.1, LANE = 1.45, WALL = HALF + 2.2;
export const B = { L: 1, R: 2, BRAKE: 4, NITRO: 8, GAS: 16, SHIFT: 32 };
export const GEARS = [0.3, 0.47, 0.62, 0.76, 0.89, 1.0];
export const DTRACKS = {
  drag: { L: 402, manual: true, grip: 1, nitro: 2.0 },
  circuit: { L: 1300, grip: 1, nitro: 3.5, traffic: 9 },
  rally: { L: 1100, grip: 0.78, nitro: 3.5, rocks: 18 },
};
export const MAX_SECONDS = 150;
export const MAX_INPUTS = 6000;

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sgn = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);
const abs = (x) => (x < 0 ? -x : x);

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Трасса из seed: когда загорится зелёный, кривизна каждого метра, препятствия.
export function buildTrack(track, seed) {
  const T = DTRACKS[track];
  if (!T) throw new Error('BAD_TRACK');
  const r = rng(seed);
  const green = 150 + Math.floor(r() * 60);
  const n = T.L + 400;
  const k = new Float64Array(n);
  if (track !== 'drag') {
    let s = 110;
    while (s < n) {
      s += 50 + Math.floor(r() * 130);
      const len = 50 + Math.floor(r() * 110), ease = 25;
      const kk = (1 / (48 + r() * 120)) * (r() < 0.5 ? -1 : 1) * (track === 'rally' ? 1.15 : 1);
      for (let i = 0; i < len + 2 * ease && s + i < n; i++) {
        const f = i < ease ? i / ease : i > len + ease ? (len + 2 * ease - i) / ease : 1;
        k[s + i] = kk * f;
      }
      s += len + 2 * ease;
    }
  }
  const obs = [];
  if (T.traffic) for (let i = 0; i < T.traffic; i++) obs.push({ kind: 'car', s0: 170 + r() * (T.L - 320), x: r() < 0.5 ? -LANE : LANE, v: 19 + r() * 9, c: i });
  if (T.rocks) for (let i = 0; i < T.rocks; i++) obs.push({ kind: 'rock', s0: 140 + r() * (T.L - 230), x: (r() * 2 - 1) * (HALF - 0.9), v: 0, c: i });
  return { track, seed, L: T.L, green, k, obs, T, maxTicks: green + MAX_SECONDS * TICK };
}
export const obsAt = (tr, o, tick) => o.s0 + o.v * (tick > tr.green ? (tick - tr.green) / TICK : 0);
export const curveAt = (tr, s) => tr.k[s < 0 ? 0 : s >= tr.k.length ? tr.k.length - 1 : Math.floor(s)];

// Характеристики машины → физика. reactionS — показатель навыка (0,98 … 0,20).
export function carParams(car, track, reactionS) {
  const vmax = Math.max(25, (car.max_speed || 180) / 3.6);
  const t0 = Math.max(1.8, (car.accel_x100 || 900) / 100);
  const r = Math.min(0.9, 27.8 / vmax);
  let ln = 0, p = r;                         // ln((1+r)/(1−r)) рядом — одинаково на любом движке
  for (let i = 1; i < 80; i += 2) { ln += p / i; p *= r * r; }
  ln *= 2;
  const h = clamp01((car.handling || 50) / 100), rel = clamp01((car.reliability || 70) / 100), pw = clamp01((car.power || 150) / 1000);
  return {
    vmax, A: (vmax / (2 * t0)) * ln, grip: 9.81 * (0.85 + 0.55 * h) * DTRACKS[track].grip,
    steer: 4 + 3 * h, brake: 8 + 4 * h, nitroA: 3 + 5 * pw, rel, clutch: Math.round(reactionS * 0.4 * TICK),
  };
}

export function newState(tr, x0 = -LANE) {
  return {
    tick: 0, s: 0, v: 0, x: x0, a: 0, gear: 1, rpm: 0.15, shiftT: 0, startAt: -1, launched: false, launch: null,
    spin: 0, bog: 0, nitro: Math.round(tr.T.nitro * TICK), nitroMax: Math.round(tr.T.nitro * TICK), nitroOn: false,
    prev: 0, finished: false, ms: 0, off: false, slide: 0, hits: 0, shift: null, cd: {}, passed: {}, hit: -1, near: -1,
  };
}

// Один шаг (1/60 с). mask — нажатые кнопки (B.*). Возвращает состояние.
export function step(tr, cp, st, mask) {
  const dt = 1 / TICK;
  const t = ++st.tick;
  const manual = !!tr.T.manual;
  const rise = (mask & B.SHIFT) && !(st.prev & B.SHIFT);
  st.prev = mask;
  st.hit = -1; st.near = -1;
  if (st.finished) { st.v = st.v > 0.5 ? st.v * 0.985 : 0; st.s += st.v * dt; return st; }

  if (!st.launched) {
    if (manual) { st.rpm += (mask & B.GAS ? 1.5 : -2.2) * dt; st.rpm = st.rpm < 0.12 ? 0.12 : st.rpm > 1 ? 1 : st.rpm; }
    if (t >= tr.green && st.startAt < 0) {
      if (!manual) st.startAt = t + cp.clutch;
      else if (mask & B.GAS) {
        st.startAt = t + cp.clutch;
        const q = st.rpm;
        st.launch = q > 0.9 ? 'spin' : q < 0.45 ? 'bog' : q >= 0.6 && q <= 0.8 ? 'perfect' : 'good';
      }
    }
    if (st.startAt >= 0 && t >= st.startAt) {
      st.launched = true;
      if (st.launch === 'spin') st.spin = 42;
      else if (st.launch === 'bog') st.bog = 30;
      else if (st.launch === 'perfect') st.v = 1.5;
    }
    if (!st.launched) return st;
  }

  st.nitroOn = !!(mask & B.NITRO) && st.nitro > 0 && !(mask & B.BRAKE);
  const vm = st.nitroOn ? cp.vmax * 1.08 : cp.vmax;
  const env = st.v >= vm ? 0 : 1 - (st.v * st.v) / (vm * vm);
  let a;
  if (manual) {
    let top = cp.vmax * GEARS[st.gear - 1];
    st.rpm = st.v / top;
    if (rise && st.gear < 6 && st.shiftT <= 0) {
      const q = st.rpm >= 0.9 && st.rpm < 0.98 ? 'perfect' : st.rpm >= 0.78 && st.rpm < 0.98 ? 'good' : st.rpm >= 0.98 ? 'late' : 'early';
      st.shiftT = q === 'perfect' ? 3 : q === 'good' ? 7 : 10;
      if (q === 'perfect') st.v += 0.4;
      st.gear++; st.shift = { tick: t, q };
      top = cp.vmax * GEARS[st.gear - 1];
      st.rpm = st.v / top;
    }
    if (st.shiftT > 0) { st.shiftT--; a = 0; }
    else if (st.rpm >= 1) { a = 0; if (st.v > top) st.v = top; }
    else a = cp.A * env * (0.45 + 0.55 * st.rpm);
  } else {
    a = mask & B.BRAKE ? -cp.brake : cp.A * env;
    st.gear = 1 + Math.min(5, Math.floor((st.v / cp.vmax) * 6));
  }
  if (st.spin > 0) { st.spin--; a *= 0.35; }
  if (st.bog > 0) { st.bog--; a *= 0.55; }
  if (st.nitroOn) { st.nitro--; if (st.v < vm) a += cp.nitroA; }
  if (st.v > vm) a = a < -2 ? a : -2;

  if (!manual) {
    const ki = curveAt(tr, st.s);
    const demand = st.v * st.v * ki;           // боковое ускорение в повороте
    const steerIn = (mask & B.R ? 1 : 0) - (mask & B.L ? 1 : 0);
    let vx = steerIn * cp.steer * (st.v < 8 ? st.v / 8 : 1) - demand * 0.12;
    const over = abs(demand) - cp.grip;
    st.slide = 0;
    if (over > 0) { vx -= sgn(demand) * over * 0.35; a -= over * 0.45; st.slide = over; }
    st.x += vx * dt;
    st.off = abs(st.x) > HALF;
    if (st.off) { a -= (5 + st.v * 0.12) * (1.3 - 0.5 * cp.rel); }
    if (abs(st.x) > WALL) { st.x = sgn(st.x) * WALL; st.v *= 0.985; }
    for (let i = 0; i < tr.obs.length; i++) {
      const o = tr.obs[i];
      const ds = obsAt(tr, o, t) - st.s;
      if (ds > 60 || ds < -8) continue;
      const dx = abs(o.x - st.x);
      const car = o.kind === 'car';
      if (!(st.cd[i] > t) && ds > -1 && ds < (car ? 4.2 : 1.6) && dx < (car ? 1.85 : 1.3)) {
        if (car) { if (st.v > o.v * 0.85) st.v = o.v * 0.85; } else st.v *= 0.55 + 0.25 * cp.rel;
        st.cd[i] = t + 60; st.hits++; st.hit = i;
        st.x += st.x >= o.x ? 0.5 : -0.5;
      }
      if (!st.passed[i] && ds < -4.5) {
        st.passed[i] = 1;
        if (car && !(st.cd[i] > t - 60) && dx < 2.9) { st.nitro = Math.min(st.nitroMax, st.nitro + 24); st.near = i; }
      }
    }
  }

  st.a = a;
  st.v += a * dt;
  if (st.v < 0) st.v = 0;
  const s0 = st.s;
  st.s += st.v * dt;
  if (st.s >= tr.L) {
    const frac = (tr.L - s0) / (st.s - s0);
    st.finished = true;
    st.ms = Math.round((t - 1 - tr.green + frac) * (1000 / TICK));
  }
  return st;
}

// Пересчёт заезда по нажатиям: inputs = [[тик, кнопки], …] — кнопки действуют с этого тика.
export function simulate(tr, cp, inputs, x0 = -LANE) {
  const st = newState(tr, x0);
  let i = 0, mask = 0;
  while (!st.finished && st.tick < tr.maxTicks) {
    while (i < inputs.length && inputs[i][0] <= st.tick + 1) mask = inputs[i++][1];
    step(tr, cp, st, mask);
  }
  return st;
}

export function validInputs(x, maxTicks) {
  if (!Array.isArray(x) || x.length > MAX_INPUTS) return false;
  let last = 0;
  for (const e of x) {
    if (!Array.isArray(e) || e.length !== 2) return false;
    const [t, m] = e;
    if (!Number.isInteger(t) || !Number.isInteger(m) || t < last || t > maxTicks || m < 0 || m > 63) return false;
    last = t;
  }
  return true;
}

// ---------- соперник-бот: «водитель» с уровнем a (0,55 … 0,9) ----------
export function aiDriver(seed, a) {
  const r = rng(seed ^ 0x5bd1e995);
  return {
    a, react: Math.round(8 + (1 - a) * 30 + r() * 8), launchRpm: 0.7 + (r() - 0.5) * (1 - a) * 0.6,
    shiftRpm: 0.95 - (1 - a) * 0.32 - r() * 0.04, nitroGear: 3 + Math.floor(r() * 2),
    margin: 0.84 + a * 0.14, lane: LANE, wobble: (1 - a) * 0.5,
  };
}
export function aiMask(tr, cp, st, ai) {
  const t = st.tick + 1;
  if (tr.T.manual) {
    let m = 0;
    if (!st.launched) { if (t < tr.green ? st.rpm < ai.launchRpm : t >= tr.green + ai.react || st.rpm < ai.launchRpm) m |= B.GAS; return m; }
    if (st.gear < 6 && st.shiftT <= 0 && st.rpm >= ai.shiftRpm && !(st.prev & B.SHIFT)) m |= B.SHIFT;
    if (st.gear >= ai.nitroGear) m |= B.NITRO;
    return m;
  }
  if (!st.launched) return 0;
  let m = 0;
  // тормоз перед поворотом
  let kmax = 0;
  const look = st.v * 1.8 + 12;
  for (let d = 0; d < look; d += 4) { const k = abs(curveAt(tr, st.s + d)); if (k > kmax) kmax = k; }
  if (kmax > 0) {
    const vl = Math.sqrt(cp.grip / kmax) * ai.margin;
    if (st.v > vl + 0.5) m |= B.BRAKE;
  }
  // объезд препятствий: из нескольких линий выбираем самую свободную на 55 м вперёд
  let tx = ai.lane, best = -1;
  for (const cx of [ai.lane, -LANE, LANE, -2.3, 0, 2.3]) {
    let free = 9;
    for (const o of tr.obs) {
      const ds = obsAt(tr, o, t) - st.s;
      if (ds > -2 && ds < 55) { const d = abs(o.x - cx); if (d < free) free = d; }
    }
    if (free > best + 0.3) { best = free; tx = cx; }
  }
  ai.lane = tx;
  const want = (tx - st.x) * 1.8 + st.v * st.v * curveAt(tr, st.s) * 0.12;
  if (want > 0.6 + ai.wobble) m |= B.R; else if (want < -0.6 - ai.wobble) m |= B.L;
  // нитро на прямой
  let kn = 0;
  for (let d = 0; d < 150; d += 10) { const k = abs(curveAt(tr, st.s + d)); if (k > kn) kn = k; }
  if (kn < 0.002 && st.v > 15 && !(m & B.BRAKE)) m |= B.NITRO;
  return m;
}
export function simulateAi(tr, cp, ai, x0 = LANE) {
  const st = newState(tr, x0);
  while (!st.finished && st.tick < tr.maxTicks) step(tr, cp, st, aiMask(tr, cp, st, ai));
  return st;
}
