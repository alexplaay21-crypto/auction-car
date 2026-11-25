// Выгрузка базы игры из tgcloud в JSON (только чтение): node deploy/export-tgcloud.mjs data/dump.json
// Нужен доступ к проекту tgcloud (npx tgcloud login). Код выгрузки — служебные команды schema / tables / dump в endpoints/ops.js.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
const out = process.argv[2] || 'data/dump.json';
const run = (args) => {
  const txt = execFileSync('npx', ['tgcloud', 'run', 'endpoints/ops', args, '--ctx', '{ initData: { user: { id: 777000 } } }'], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });
  const line = txt.split('\n').find((l) => l.startsWith('< '));
  if (!line) throw new Error('нет ответа: ' + txt.slice(-300));
  return line;
};
const b64 = (line) => JSON.parse(Buffer.from(/b64:'([^']*)'/.exec(line)[1], 'base64').toString('utf8'));
const schema = b64(run('{ action: "schema" }'));
const counts = Object.fromEntries([...run('{ action: "tables" }').matchAll(/([a-z_0-9]+):(\d+)/g)].map((m) => [m[1], +m[2]]));
const tables = {};
for (const t of schema.filter((s) => s.type === 'table' && !s.name.startsWith('sqlite_')).map((s) => s.name)) {
  tables[t] = [];
  for (let o = 0; o < (counts[t] ?? 0); o += 1000) tables[t].push(...b64(run(`{ action: "dump", table: "${t}", offset: ${o}, limit: 1000 }`)));
  if (tables[t].length !== (counts[t] ?? 0)) throw new Error(`${t}: ${tables[t].length} из ${counts[t]}`);
  process.stdout.write(`${t} ${tables[t].length}  `);
}
const sequence = b64(run('{ action: "dump", table: "sqlite_sequence", offset: 0, limit: 5000 }'));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ exported_at: new Date().toISOString(), schema, tables, sequence }));
console.log('\nготово:', out);
