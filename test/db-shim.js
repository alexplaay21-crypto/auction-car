// Локальная замена `db` из SDK платформы для автотестов (node:sqlite).
import { DatabaseSync } from 'node:sqlite';

export function makeDb() {
  const raw = new DatabaseSync(':memory:');
  const prep = (q) => raw.prepare(q);
  const norm = (p) => p ?? {};
  const plain = (r) => (r ? { ...r } : r);
  const db = {
    raw,
    async run(q, p) {
      const st = prep(q);
      if (/\bRETURNING\b/i.test(q)) {
        const rows = st.all(norm(p)).map(plain);
        return { rowsAffected: rows.length, lastInsertRowid: 0, rows };
      }
      const r = st.run(norm(p));
      return { rowsAffected: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid), rows: [] };
    },
    async all(q, p) { return prep(q).all(norm(p)).map(plain); },
    async get(q, p) { return plain(prep(q).get(norm(p))) ?? null; },
  };
  return db;
}

export async function setClock(db, offsetS) {
  await db.run('INSERT INTO sys_clock (id, offset_s) VALUES (1, :o) ON CONFLICT (id) DO UPDATE SET offset_s = excluded.offset_s', { ':o': offsetS });
}
