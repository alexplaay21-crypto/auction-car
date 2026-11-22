// lib/ddl11.js — миграция 28: пятая редкость «Мистическая» (mystic).
//
// У таблицы cars редкость ограничена CHECK, а SQLite не умеет менять CHECK. Таблицу
// приходится пересобрать: новая таблица → копия строк → старая удаляется → новая
// получает старое имя. Триггеры и представления, которые читают cars, мешают
// переименованию («no such table: main.cars»), поэтому они снимаются и ставятся обратно
// из своих же определений в sqlite_master. Ни одна строка машин, гаражей, балансов или
// журнала не меняется: id машин сохраняются как есть.
//
// Шаги идемпотентны: если миграция оборвалась посреди, повторный запуск продолжает.
const RARITY_OLD = "CHECK (rarity IN ('common', 'rare', 'epic', 'mythic'))";
const RARITY_NEW = "CHECK (rarity IN ('common', 'rare', 'epic', 'mythic', 'mystic'))";
const REFS_CARS = /\bcars\b/i;
// рынок: мистические машины тоже можно выставить
const patch = (sql) => sql.includes("'mystic'") ? sql : sql.replace("NOT IN ('epic', 'mythic')", "NOT IN ('epic', 'mythic', 'mystic')");

// столбцы cars (ALTER TABLE cars нигде не было — список полный)
const cols = 'id, name, country, rarity, max_speed, accel_x100, power, handling, reliability, price, color, body, is_active';
async function safeRun(db, q) {
  try { await db.run(q); } catch (e) { if (!/looks like a read one/i.test(String(e?.message))) throw e; }
}

export async function rebuildCars(db) {
  const master = await db.all("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL");
  const has = (n) => master.some((m) => m.name === n);
  // сохранённые определения триггеров/представлений (на случай обрыва — в служебной таблице)
  await safeRun(db, 'CREATE TABLE IF NOT EXISTS mig28_saved (name TEXT PRIMARY KEY, type TEXT NOT NULL, sql TEXT NOT NULL)');
  const cars = master.find((m) => m.type === 'table' && m.name === 'cars');
  if (cars && cars.sql.includes("'mystic'") && !has('cars_v2')) {
    // таблица уже новая — вернуть снятые триггеры, если остались
  } else {
    if (!has('cars_v2')) {
      const src = cars?.sql;
      if (!src || !src.includes(RARITY_OLD)) throw new Error('mig28: unexpected cars schema');
      await db.run(src.replace(/CREATE TABLE (IF NOT EXISTS )?cars\b/, 'CREATE TABLE cars_v2').replace(RARITY_OLD, RARITY_NEW));
    }
    if (has('cars') || cars) {
      await safeRun(db, `INSERT INTO cars_v2 (${cols}) SELECT ${cols} FROM cars WHERE id NOT IN (SELECT id FROM cars_v2)`);
    }
    const deps = master.filter((m) => (m.type === 'trigger' || m.type === 'view') && REFS_CARS.test(m.sql));
    for (const d of deps) await safeRun(db, `INSERT INTO mig28_saved (name, type, sql) VALUES ('${d.name}', '${d.type}', '${d.sql.replace(/'/g, "''")}') ON CONFLICT (name) DO NOTHING`);
    const idx = master.filter((m) => m.type === 'index' && m.tbl_name === 'cars');
    for (const d of idx) await safeRun(db, `INSERT INTO mig28_saved (name, type, sql) VALUES ('${d.name}', 'index', '${d.sql.replace(/'/g, "''")}') ON CONFLICT (name) DO NOTHING`);
    for (const d of deps) await safeRun(db, `DROP ${d.type === 'view' ? 'VIEW' : 'TRIGGER'} IF EXISTS ${d.name}`);
    const nOld = (await db.get("SELECT count(*) n FROM sqlite_master WHERE name = 'cars'")).n;
    if (nOld) {
      const a = (await db.get('SELECT count(*) n FROM cars')).n, b = (await db.get('SELECT count(*) n FROM cars_v2')).n;
      if (a !== b) throw new Error(`mig28: copy mismatch ${a} vs ${b}`);
      await db.run('DROP TABLE cars');
    }
    await db.run('ALTER TABLE cars_v2 RENAME TO cars');
  }
  const saved = await db.all('SELECT name, type, sql FROM mig28_saved');
  const now = new Set((await db.all('SELECT name FROM sqlite_master')).map((r) => r.name));
  // сначала индексы и представления, потом триггеры
  const order = { index: 0, view: 1, trigger: 2 };
  for (const s of saved.sort((x, y) => order[x.type] - order[y.type])) if (!now.has(s.name)) await db.run(patch(s.sql));
  // триггеры, которые не снимались, тоже должны пускать мистические машины на рынок
  const lb = (await db.get("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'listings_bi'"))?.sql;
  if (lb && !lb.includes("'mystic'")) { await db.run('DROP TRIGGER listings_bi'); await db.run(patch(lb)); }
  await db.run('DROP TABLE mig28_saved');
}

// после пересборки: шанс мистической (из 1000) берётся из легендарной — сумма шансов прежняя
export async function migration28(db) {
  await rebuildCars(db);
  const ct = (await db.get("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'containers'")).sql;
  if (!/chance_mystic/.test(ct)) await db.run('ALTER TABLE containers ADD COLUMN chance_mystic INTEGER');
  await safeRun(db, "INSERT INTO settings (k, v) VALUES ('chance_mystic', 1) ON CONFLICT (k) DO NOTHING");
  await safeRun(db, "UPDATE settings SET v = 4 WHERE k = 'chance_mythic' AND v = 5");
}
