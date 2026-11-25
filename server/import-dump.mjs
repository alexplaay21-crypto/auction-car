// Загрузка выгрузки tgcloud в базу своего сервера: node server/import-dump.mjs data/dump.json [путь к базе]
// Порядок: таблицы → строки → индексы и представления → триггеры. Триггеры создаются после данных,
// иначе денежные триггеры сработали бы ещё раз и задвоили балансы и журнал.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
const [file = 'data/dump.json', dbPath = process.env.DB_PATH || 'data/game.db'] = process.argv.slice(2);
if (existsSync(dbPath) && !process.argv.includes('--force')) { console.error(`база ${dbPath} уже есть — чтобы перезаписать, добавьте --force (старую сохраните!)`); process.exit(1); }
mkdirSync(dirname(dbPath), { recursive: true });
const d = JSON.parse(readFileSync(file, 'utf8'));
const db = new DatabaseSync(dbPath);
if (process.argv.includes('--force')) for (const r of db.prepare("SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND type IN ('trigger','view','table')").all())
  db.exec(`DROP ${r.type.toUpperCase()} IF EXISTS "${r.name}"`);
db.exec('BEGIN');
for (const s of d.schema.filter((x) => x.type === 'table' && !x.name.startsWith('sqlite_'))) db.exec(s.sql);
let n = 0;
for (const [t, rows] of Object.entries(d.tables)) {
  if (!rows.length) continue;
  const cols = Object.keys(rows[0]);
  const st = db.prepare(`INSERT INTO "${t}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`);
  for (const r of rows) { st.run(...cols.map((c) => r[c])); n++; }
}
for (const type of ['index', 'view', 'trigger']) for (const s of d.schema.filter((x) => x.type === type)) db.exec(s.sql);
for (const s of d.sequence ?? []) db.prepare('INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES (?, ?)').run(s.name, s.seq);
db.exec('COMMIT');
// проверка: число строк как в выгрузке
for (const [t, rows] of Object.entries(d.tables)) {
  const c = db.prepare(`SELECT count(*) AS n FROM "${t}"`).get().n;
  if (c !== rows.length) { console.error(`${t}: ${c} вместо ${rows.length}`); process.exit(1); }
}
console.log(`загружено строк: ${n}, таблиц: ${Object.keys(d.tables).length} → ${dbPath}`);
