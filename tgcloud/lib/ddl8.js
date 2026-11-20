// ddl8.js — миграция 12: немецкий контейнер — 50 узнаваемых машин (30 / 14 / 4 / 2).
// Машины старого каталога (keep) превращаются в свою модель на месте — у игроков ничего не пропадает,
// новые получают id с 101 по порядку списка.
import { GERMAN } from './catalog_de.js';

export const GERMAN_FIRST_ID = 101;
const q = (s) => (s == null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`);

// id машины в базе для каждой строки GERMAN (по порядку)
export function germanIds() {
  let next = GERMAN_FIRST_ID;
  return GERMAN.map((c) => c[11] ?? next++);
}

export const MIGRATION_12 = (() => {
  const ids = germanIds();
  const out = [];
  GERMAN.forEach(([name, , rarity, speed, accel, power, handling, reliability, price, body, color, keep], i) => {
    const id = ids[i];
    const v = `${q(name)}, 'Германия', '${rarity}', ${speed}, ${Math.round(accel * 100)}, ${power}, ${handling}, ${reliability}, ${price}, ${q(color)}, ${q(body)}`;
    if (keep) {
      out.push(`UPDATE cars SET (name, country, rarity, max_speed, accel_x100, power, handling, reliability, price, color, body) = (${v}) WHERE id = ${id}`);
    } else {
      out.push(`INSERT INTO cars (id, name, country, rarity, max_speed, accel_x100, power, handling, reliability, price, color, body) VALUES (${id}, ${v})
        ON CONFLICT (id) DO UPDATE SET name = excluded.name, rarity = excluded.rarity, price = excluded.price`);
    }
    out.push(`INSERT INTO container_cars (container_id, car_id, weight) VALUES (2, ${id}, 1) ON CONFLICT DO NOTHING`);
  });
  return out;
})();

// Миграция 13: немецкий контейнер — современные модели вместо старых (те же id, все поля обновляются).
export const upsertGerman = () => {
  const ids = germanIds();
  return GERMAN.map(([name, , rarity, speed, accel, power, handling, reliability, price, body, color], i) =>
    `INSERT INTO cars (id, name, country, rarity, max_speed, accel_x100, power, handling, reliability, price, color, body)
     VALUES (${ids[i]}, ${q(name)}, 'Германия', '${rarity}', ${speed}, ${Math.round(accel * 100)}, ${power}, ${handling}, ${reliability}, ${price}, ${q(color)}, ${q(body)})
     ON CONFLICT (id) DO UPDATE SET name = excluded.name, country = excluded.country, rarity = excluded.rarity, max_speed = excluded.max_speed,
       accel_x100 = excluded.accel_x100, power = excluded.power, handling = excluded.handling, reliability = excluded.reliability,
       price = excluded.price, color = excluded.color, body = excluded.body`);
};
export const MIGRATION_13 = upsertGerman();
// 14: цены обычных — 60 % дешевле контейнера ($5 000), 40 % немного дороже.
export const MIGRATION_14 = upsertGerman();
// 15: модели под 3D-рендер (часть машин заменена на те, для которых есть хорошие 3D-модели).
export const MIGRATION_15 = upsertGerman();

// ---------- остальные страны ----------
import { WORLD, buildCountry } from './catalog_world.js';
export function worldIds(cid) {
  let next = WORLD[cid].base;
  return WORLD[cid].cars.map((c) => c[4] ?? next++);
}
// Машины страны: старые (keep) обновляются на месте, новые добавляются и попадают в пул контейнера.
export function upsertWorld(cid) {
  const W = WORLD[cid], ids = worldIds(cid), rows = buildCountry(cid);
  const out = [];
  rows.forEach(([name, , rarity, speed, accel, power, handling, reliability, price, body, color], i) => {
    out.push(`INSERT INTO cars (id, name, country, rarity, max_speed, accel_x100, power, handling, reliability, price, color, body)
     VALUES (${ids[i]}, ${q(name)}, ${q(W.country)}, '${rarity}', ${speed}, ${Math.round(accel * 100)}, ${power}, ${handling}, ${reliability}, ${price}, ${q(color)}, ${q(body)})
     ON CONFLICT (id) DO UPDATE SET name = excluded.name, country = excluded.country, rarity = excluded.rarity, max_speed = excluded.max_speed,
       accel_x100 = excluded.accel_x100, power = excluded.power, handling = excluded.handling, reliability = excluded.reliability,
       price = excluded.price, color = excluded.color, body = excluded.body`);
    out.push(`INSERT INTO container_cars (container_id, car_id, weight) VALUES (${cid}, ${ids[i]}, 1) ON CONFLICT DO NOTHING`);
  });
  return out;
}

// 16: японский контейнер — 50 машин по 3D-моделям.
export const MIGRATION_16 = upsertWorld(1);

// 17: американский контейнер — 50 машин по 3D-моделям.
export const MIGRATION_17 = upsertWorld(3);

// 18: французский контейнер — 50 машин по 3D-моделям.
export const MIGRATION_18 = upsertWorld(7);

// 19: контейнер «Весь мир» — 50 машин по 3D-моделям.
export const MIGRATION_19 = upsertWorld(8);
// 22: итальянский контейнер — 50 машин.
export const MIGRATION_22 = upsertWorld(4);
