// sdk — замена SDK платформы tgcloud для своего сервера.
//  db  — SQLite (node:sqlite) с теми же вызовами, что у платформы: run / all / get, параметры :name;
//  api — Telegram Bot API: api.sendMessage({...}) → результат, ошибка → BotApiError; файлы — InputFile;
//  EndpointError — отказ endpoint'а Mini App (HTTP 400 с description и parameters).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const env = process.env;
const DB_PATH = env.DB_PATH || new URL('../../data/game.db', import.meta.url).pathname;
mkdirSync(dirname(DB_PATH), { recursive: true });
const raw = new DatabaseSync(DB_PATH);
raw.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');

// undefined → NULL, true/false → 1/0 (как на платформе)
const norm = (p) => {
  const o = {};
  for (const [k, v] of Object.entries(p ?? {})) o[k] = v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v;
  return o;
};
const plain = (r) => (r ? { ...r } : r);
export const db = {
  raw,
  async run(q, p) {
    const st = raw.prepare(q);
    if (/\bRETURNING\b/i.test(q)) { const rows = st.all(norm(p)).map(plain); return { rowsAffected: rows.length, lastInsertRowid: 0, rows }; }
    const r = st.run(norm(p));
    return { rowsAffected: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid), rows: [] };
  },
  async all(q, p) { return raw.prepare(q).all(norm(p)).map(plain); },
  async get(q, p) { return plain(raw.prepare(q).get(norm(p))) ?? null; },
};

export class EndpointError extends Error {
  constructor(description, parameters = {}) { super(description); this.description = description; this.parameters = parameters; }
}
export class BotApiError extends Error {
  constructor(code, description, parameters) { super(description); this.code = code; this.description = description; this.parameters = parameters; }
}
// файл для Bot API: InputFile(данные, имя, { type })
export class InputFile {
  constructor(data, filename = 'file', opts = {}) { this.data = data; this.filename = filename; this.type = opts.type || 'application/octet-stream'; }
}

const TOKEN = env.BOT_TOKEN || '';
const API = (env.TELEGRAM_API || 'https://api.telegram.org') + '/bot' + TOKEN + '/';

async function callApi(method, params = {}) {
  if (!TOKEN) throw new BotApiError(401, 'BOT_TOKEN не задан', {});
  const files = [];
  // вложенные файлы (media в editMessageMedia и т.п.) — как attach://имя
  const walk = (v) => {
    if (v instanceof InputFile) { const n = 'f' + files.length; files.push([n, v]); return 'attach://' + n; }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  const top = {};
  for (const [k, v] of Object.entries(params)) { if (v === undefined || v === null) continue; top[k] = v instanceof InputFile ? v : walk(v); }
  let res;
  if (files.length || Object.values(top).some((v) => v instanceof InputFile)) {
    const form = new FormData();
    for (const [k, v] of Object.entries(top)) {
      if (v instanceof InputFile) form.append(k, new Blob([v.data], { type: v.type }), v.filename);
      else form.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    for (const [n, f] of files) form.append(n, new Blob([f.data], { type: f.type }), f.filename);
    res = await fetch(API + method, { method: 'POST', body: form });
  } else {
    res = await fetch(API + method, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(top) });
  }
  const j = await res.json().catch(() => ({ ok: false, error_code: res.status, description: 'Bad response' }));
  if (!j.ok) throw new BotApiError(j.error_code, j.description, j.parameters);
  return j.result;
}
export const api = new Proxy({}, { get: (_, method) => (typeof method === 'string' ? (params) => callApi(method, params) : undefined) });
const _fetch = globalThis.fetch;
export { _fetch as fetch };
