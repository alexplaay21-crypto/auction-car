// lib/race.js — расчёт заезда. Время = базовое время трассы × (1,55 − 0,8 × производительность)
// + время реакции гонщика (навык) + случайность. Ненадёжная машина иногда даёт сбой (+время).
// Веса характеристик зависят от трассы: драг — разгон и мощность, кольцо — скорость и
// управляемость, ралли — управляемость и надёжность.
export const TRACKS = {
  drag: { name: 'Драг 402 м', base: 13.0, w: { accel: 0.45, power: 0.35, speed: 0.15, handling: 0.05, reliability: 0 } },
  circuit: { name: 'Кольцо', base: 85, w: { accel: 0.15, power: 0.15, speed: 0.30, handling: 0.35, reliability: 0.05 } },
  rally: { name: 'Ралли', base: 140, w: { accel: 0.15, power: 0.10, speed: 0.10, handling: 0.35, reliability: 0.30 } },
};

const clamp01 = (x) => Math.max(0, Math.min(1, x));
export function performance(car, track) {
  const w = TRACKS[track].w;
  const n = {
    accel: clamp01((12 - car.accel_x100 / 100) / 10),   // 2 с → 1, 12 с → 0
    power: clamp01(car.power / 1000),
    speed: clamp01((car.max_speed - 140) / 280),
    handling: clamp01(car.handling / 100),
    reliability: clamp01(car.reliability / 100),
  };
  return Object.entries(w).reduce((s, [k, v]) => s + n[k] * v, 0);
}

function gauss(rnd) { // Бокс — Мюллер
  const u = Math.max(1e-9, rnd()), v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Итог одного заезда в миллисекундах и что произошло (для анимации и истории).
export function runTime(car, track, reactionS, rnd = Math.random) {
  const t = TRACKS[track];
  const perf = performance(car, track);
  let time = t.base * (1.55 - 0.8 * perf);
  time *= 1 + gauss(rnd) * 0.012;
  let glitch = false;
  if (rnd() < (100 - car.reliability) / 500) { glitch = true; time *= 1.04 + rnd() * 0.05; }
  time += reactionS;
  return { ms: Math.round(time * 1000), perf, glitch };
}

// Соперник-бот: машина из каталога близкой стоимости, реакция бота 0,3–0,7 с.
export function pickBot(cars, myCar, rnd = Math.random) {
  const near = cars.filter((c) => c.id !== myCar.id && c.price >= myCar.price * 0.6 && c.price <= myCar.price * 1.6);
  const pool = near.length ? near : cars;
  return { car: pool[Math.floor(rnd() * pool.length)], reaction: 0.3 + rnd() * 0.4 };
}
