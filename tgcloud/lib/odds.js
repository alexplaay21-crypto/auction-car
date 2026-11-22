// odds.js — шансы выпадения в зависимости от текущей цены контейнера.
// t ∈ [0, 1] — где цена контейнера в своей вилке: 0 — самый дешёвый, 1 — самый дорогой.
// Чем дороже контейнер, тем выше шанс редких машин и дорогих машин внутри редкости; самая дешёвая
// машина может выпасть всегда. Мистическая — ровно 1 из 1000 при любой цене.
export const MYSTIC_PM = 1;
// машины дорогие (редкая до $75 000, эпическая до $200 000, легендарная до $600 000, мистическая от $1 млн),
// а контейнер не дороже $24 000 — поэтому шансы на дорогие редкости небольшие
const W0 = { rare: 40, epic: 6, mythic: 1 };    // шансы (из 1000) у самого дешёвого контейнера
const W1 = { rare: 110, epic: 25, mythic: 5 };  // … у самого дорогого
const lerp = (a, b, t) => a + (b - a) * t;

// Шансы редкостей (из 1000) при положении t. present — редкости, которые есть в контейнере:
// шанс отсутствующих (кроме мистической) уходит в обычные, чтобы мистическая всегда оставалась 1 из 1000.
export function rarityWeights(t, present = null) {
  const x = Math.max(0, Math.min(1, t));
  const w = { mystic: MYSTIC_PM };
  for (const r of ['rare', 'epic', 'mythic']) w[r] = Math.round(lerp(W0[r], W1[r], x));
  w.common = 1000 - w.mystic - w.rare - w.epic - w.mythic;
  if (present) {
    for (const r of ['rare', 'epic', 'mythic']) if (!present.has(r)) { w.common += w[r]; w[r] = 0; }
    if (!present.has('mystic')) w.mystic = 0;
    if (!present.has('common')) { // нет обычных — их доля уходит в самую частую из оставшихся
      const to = ['rare', 'epic', 'mythic'].find((r) => present.has(r));
      if (to) w[to] += w.common;
      w.common = 0;
    }
  }
  return w;
}

// Вес машины внутри редкости: дорогие — вероятнее при дорогом контейнере (q — место по цене внутри редкости, 0…1).
export const tilt = (t, q) => 1 + 2 * Math.max(0, Math.min(1, t)) * q;

// Средняя цена выпавшей машины при положении t. cars — [{ rarity, price }].
export function expectedValue(cars, t) {
  const by = {};
  for (const c of cars) (by[c.rarity] ??= []).push(c.price);
  const w = rarityWeights(t, new Set(Object.keys(by)));
  let ev = 0;
  for (const [r, prices] of Object.entries(by)) {
    if (!w[r]) continue;
    const sorted = [...prices].sort((a, b) => a - b);
    let sw = 0, sp = 0;
    sorted.forEach((p, i) => { const k = tilt(t, sorted.length > 1 ? i / (sorted.length - 1) : 0); sw += k; sp += k * p; });
    ev += (w[r] / 1000) * (sp / sw);
  }
  return ev;
}

// Вилка цены контейнера: от средней машины при t = 0 до средней машины при t = 1, но не дороже cap.
// tTop — до какого t доходит верх вилки, если упёрлись в cap.
export function priceBand(cars, cap = 24_000) {
  const ev0 = expectedValue(cars, 0), ev1 = expectedValue(cars, 1);
  const lo = Math.min(cap, Math.max(2_000, Math.round(ev0 / 500) * 500));
  let hi = Math.min(cap, Math.round(ev1 / 500) * 500), tTop = 1;
  if (ev1 > cap) {
    let a = 0, b = 1; // EV(t) растёт с t — ищем t, где EV = cap
    for (let i = 0; i < 30; i++) { const m = (a + b) / 2; if (expectedValue(cars, m) > cap) b = m; else a = m; }
    tTop = a;
  }
  if (hi < lo) hi = lo;
  return { lo, hi, tTop };
}

// Положение цены в вилке → t для шансов
export function tOf(price, lo, hi, tTop = 1) {
  if (!(hi > lo)) return 0;
  return Math.max(0, Math.min(1, (price - lo) / (hi - lo))) * tTop;
}
