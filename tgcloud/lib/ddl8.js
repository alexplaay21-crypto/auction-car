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
import { WORLD, buildCountry, containerPrice, CONTAINER_EXTRA, DISABLED_CONTAINERS } from './catalog_world.js';
export function worldIds(cid) {
  let next = WORLD[cid].base;
  return WORLD[cid].cars.map((c) => c[5] ?? next++);
}
// Машины страны: старые (keep) обновляются на месте, новые добавляются и попадают в пул контейнера.
// legacy — для миграций до 28: там в CHECK ещё нет мистической, она пишется легендарной (миграция 29 ставит итог).
export function upsertWorld(cid, { legacy = true, specs = false } = {}) {
  const W = WORLD[cid], ids = worldIds(cid), rows = buildCountry(cid);
  const out = [];
  rows.forEach(([name, , rar, speed, accel, power, handling, reliability, price, body, color, , factory], i) => {
    const rarity = legacy && rar === 'mystic' ? 'mythic' : rar;
    out.push(`INSERT INTO cars (id, name, country, rarity, max_speed, accel_x100, power, handling, reliability, price, color, body${specs ? ', factory' : ''})
     VALUES (${ids[i]}, ${q(name)}, ${q(W.country)}, '${rarity}', ${speed}, ${Math.round(accel * 100)}, ${power}, ${handling}, ${reliability}, ${price}, ${q(color)}, ${q(body)}${specs ? ', ' + factory : ''})
     ON CONFLICT (id) DO UPDATE SET name = excluded.name, country = excluded.country, rarity = excluded.rarity, max_speed = excluded.max_speed,
       accel_x100 = excluded.accel_x100, power = excluded.power, handling = excluded.handling, reliability = excluded.reliability,
       price = excluded.price, color = excluded.color, body = excluded.body${specs ? ', factory = excluded.factory' : ''}`);
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
// 23: российский контейнер — 50 машин.
export const MIGRATION_23 = upsertWorld(5);
// 24: китайский контейнер — 50 машин.
export const MIGRATION_24 = upsertWorld(6);

// 26: все 8 контейнеров заново — новые популярные машины, заводские цены, цена контейнера по ним.
export const MIGRATION_26 = [1, 2, 3, 4, 5, 6, 7, 8].flatMap((cid) => [
  ...upsertWorld(cid),
  `UPDATE containers SET price = ${containerPrice(cid)} WHERE id = ${cid}`,
  `UPDATE container_meta SET base_price = ${containerPrice(cid)}, market = ${Math.round(containerPrice(cid) * 100 / 55)}, prev_price = ${containerPrice(cid)} WHERE container_id = ${cid}`,
]);

// 27: редкость по цене (эпическая не дороже легендарной), замены машин после проверки картинок.
export const MIGRATION_27 = [1, 2, 3, 4, 5, 6, 7, 8].flatMap((cid) => [
  ...upsertWorld(cid),
  `UPDATE containers SET price = ${containerPrice(cid)} WHERE id = ${cid}`,
  `UPDATE container_meta SET base_price = ${containerPrice(cid)}, market = ${Math.round(containerPrice(cid) * 100 / 55)}, prev_price = ${containerPrice(cid)} WHERE container_id = ${cid}`,
]).concat([
  // машины сезона Battle Pass: премиум — эпическая, делюкс — легендарная (той же страны, если редкость сменилась)
  `UPDATE bp_seasons SET dx_car_id = (SELECT c2.id FROM cars c1 JOIN cars c2 ON c2.country = c1.country AND c2.rarity = 'mythic'
     WHERE c1.id = bp_seasons.dx_car_id ORDER BY c2.price LIMIT 1)
   WHERE dx_car_id IS NOT NULL AND (SELECT rarity FROM cars WHERE id = dx_car_id) <> 'mythic'`,
  `UPDATE bp_seasons SET prem_car_id = (SELECT c2.id FROM cars c1 JOIN cars c2 ON c2.country = c1.country AND c2.rarity = 'epic'
     WHERE c1.id = bp_seasons.prem_car_id ORDER BY abs(c2.price - c1.price) LIMIT 1)
   WHERE prem_car_id IS NOT NULL AND (SELECT rarity FROM cars WHERE id = prem_car_id) <> 'epic'`,
]);

// 29: редкость по эксклюзивности (мистическая, легендарная — только малые серии), Россия — 35 машин
// российских и советских марок. Убранные машины остаются у владельцев как есть, но больше не выпадают:
// они выходят из контейнера и из наград (is_active = 0 для машин вне всех контейнеров).
// Синхронизация каталога с catalog_world.js: машины, состав контейнеров, цены контейнеров, машины сезона BP.
export const catalogSync = (o = {}) => [1, 2, 3, 4, 5, 6, 7, 8].flatMap((cid) => [
  ...upsertWorld(cid, { legacy: false, ...o }),
  // машины других стран в этом контейнере (контейнер «Неизвестный» — ещё и российские)
  ...(CONTAINER_EXTRA[cid] ?? []).flatMap((x) => worldIds(x)).map((id) => `INSERT INTO container_cars (container_id, car_id, weight) VALUES (${cid}, ${id}, 1) ON CONFLICT DO NOTHING`),
  `DELETE FROM container_cars WHERE container_id = ${cid} AND car_id NOT IN (${[cid, ...(CONTAINER_EXTRA[cid] ?? [])].flatMap((x) => worldIds(x)).join(', ')})`,
  `UPDATE containers SET price = ${containerPrice(cid)} WHERE id = ${cid}`,
  `UPDATE container_meta SET base_price = ${containerPrice(cid)}, market = ${Math.round(containerPrice(cid) * 100 / 55)}, prev_price = ${containerPrice(cid)} WHERE container_id = ${cid}`,
]).concat([
  ...DISABLED_CONTAINERS.map((c) => `UPDATE containers SET is_enabled = 0 WHERE id = ${c} AND is_enabled = 1`),
  'UPDATE cars SET is_active = 0 WHERE is_active = 1 AND id NOT IN (SELECT car_id FROM container_cars)',
  'UPDATE cars SET is_active = 1 WHERE is_active = 0 AND id IN (SELECT car_id FROM container_cars)',
  // машины сезона Battle Pass: премиум — эпическая, делюкс — легендарная (той же страны, из контейнера)
  `UPDATE bp_seasons SET dx_car_id = COALESCE(
       (SELECT c2.id FROM cars c1 JOIN cars c2 ON c2.country = c1.country AND c2.rarity = 'mythic' AND c2.is_active = 1
        WHERE c1.id = bp_seasons.dx_car_id ORDER BY c2.price LIMIT 1),
       (SELECT c2.id FROM cars c1, cars c2 WHERE c1.id = bp_seasons.dx_car_id AND c2.rarity = 'mythic' AND c2.is_active = 1
        ORDER BY abs(c2.price - c1.price) LIMIT 1), dx_car_id)
   WHERE dx_car_id IS NOT NULL AND (SELECT rarity FROM cars WHERE id = dx_car_id) <> 'mythic'`,
  `UPDATE bp_seasons SET prem_car_id = COALESCE(
       (SELECT c2.id FROM cars c1 JOIN cars c2 ON c2.country = c1.country AND c2.rarity = 'epic' AND c2.is_active = 1
        WHERE c1.id = bp_seasons.prem_car_id ORDER BY abs(c2.price - c1.price) LIMIT 1),
       (SELECT c2.id FROM cars c1, cars c2 WHERE c1.id = bp_seasons.prem_car_id AND c2.rarity = 'epic' AND c2.is_active = 1
        ORDER BY abs(c2.price - c1.price) LIMIT 1), prem_car_id)
   WHERE prem_car_id IS NOT NULL AND (SELECT rarity FROM cars WHERE id = prem_car_id) <> 'epic'`,
]);
export const MIGRATION_29 = catalogSync();

// 30: Франция — убраны Citroen C1 и Renault Talisman (битые 3D-модели), у владельцев остаются; развёрнутые машины.
export const MIGRATION_30 = catalogSync();

// 33: российский контейнер убран с аукциона, его машины — в контейнере «Неизвестный» (бывший «Весь мир»).
import { RENAMED_CONTAINERS } from './catalog_world.js';
export const MIGRATION_33 = catalogSync().concat(Object.entries(RENAMED_CONTAINERS).map(([id, c]) =>
  `UPDATE containers SET name = ${q(c.name)}, country = ${q(c.country)}, emoji = ${q(c.emoji)} WHERE id = ${id}`));

// 35: экономика — контейнер стоит столько, сколько в среднем стоит машина внутри (раньше ≈55 %, и каждый
// контейнер в среднем приносил +60–80 %); без ставок цена падает не ниже 90 % базовой;
// пакеты за звёзды — под новые цены (балансы игроков не меняются).
export const STAR_MONEY_35 = { m50: 150_000, m100: 330_000, m250: 900_000, m500: 2_000_000, m1000: 4_500_000, m2500: 12_000_000 };
export const MIGRATION_35 = catalogSync().concat([
  "UPDATE settings SET v = 90 WHERE k = 'price_floor_pct' AND v < 90",
  ...Object.entries(STAR_MONEY_35).map(([id, m]) => `UPDATE star_products SET money = ${m} WHERE id = '${id}' AND kind = 'money'`),
]);

