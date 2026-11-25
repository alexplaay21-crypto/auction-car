// server/main.js — бот и мини-приложение на своём сервере (вместо платформы tgcloud).
//  • приём обновлений бота: long polling (getUpdates) → tgcloud/handlers/<тип>.js;
//  • мини-приложение: статика web/dist + POST /api/<имя> → tgcloud/endpoints/<имя>.js, initData проверяется подписью бота;
//  • фоновый тик раз в 2 с: завершение торгов, старт следующих контейнеров, обновление сообщений комнат в чатах.
// Настройки — переменные окружения (deploy/server.env): BOT_TOKEN, MINI_APP_URL, BOT_USERNAME, PORT, DB_PATH.
import http from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync, existsSync, statSync, createReadStream } from 'node:fs';
import { join, extname, normalize } from 'node:path';

// .env рядом с проектом (если systemd не передал переменные)
for (const f of [process.env.ENV_FILE, new URL('../.env', import.meta.url).pathname]) {
  if (!f || !existsSync(f)) continue;
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
const ROOT = new URL('..', import.meta.url).pathname;
const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) { console.error('BOT_TOKEN не задан (deploy/server.env)'); process.exit(1); }
const PORT = Number(process.env.PORT || 8080);
const STATIC = join(ROOT, 'web/dist');

const { db, api, InputFile } = await import('sdk');
const engine = await import('../tgcloud/lib/engine.js');
const { sync } = await import('../tgcloud/lib/live.js');
const { OPERATOR_ID } = await import('../tgcloud/lib/config.js');
console.log('миграции:', (await engine.migrate(db)).join(', ') || 'нет новых');

// ---------- проверка initData мини-приложения (подпись Telegram) ----------
const SECRET = createHmac('sha256', 'WebAppData').update(TOKEN).digest();
function verifyInitData(raw) {
  if (!raw) return null;
  const p = new URLSearchParams(raw);
  const hash = p.get('hash'); if (!hash) return null;
  p.delete('hash');
  const check = [...p.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n');
  const calc = createHmac('sha256', SECRET).update(check).digest();
  const got = Buffer.from(hash, 'hex');
  if (got.length !== calc.length || !timingSafeEqual(got, calc)) return null;
  const auth = Number(p.get('auth_date') || 0);
  if (!auth || Date.now() / 1000 - auth > 7 * 86400) return null; // не старше недели
  const out = {};
  for (const [k, v] of p.entries()) out[k] = ['user', 'receiver', 'chat'].includes(k) ? JSON.parse(v) : k === 'auth_date' ? Number(v) : v;
  return out;
}

// ---------- модули endpoints и handlers (как на платформе) ----------
const cache = new Map();
async function mod(path) {
  if (!cache.has(path)) cache.set(path, existsSync(path) ? (await import(path)).default : null);
  return cache.get(path);
}

// ---------- HTTP ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg' };
const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'content-type': type }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };

async function onApi(req, res, name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || name === 'ops') return send(res, 404, { ok: false, description: 'Not found' });
  const fn = await mod(join(ROOT, 'tgcloud/endpoints', name + '.js'));
  if (!fn) return send(res, 404, { ok: false, description: 'Not found' });
  const initData = verifyInitData(req.headers['x-telegram-init-data']);
  if (!initData) return send(res, 401, { ok: false, description: 'Bad init data' });
  let body = '';
  for await (const chunk of req) { body += chunk; if (body.length > 8e6) return send(res, 413, { ok: false, description: 'Too large' }); }
  let input = {};
  try { input = body ? JSON.parse(body) : {}; } catch { return send(res, 400, { ok: false, description: 'Bad JSON' }); }
  try {
    const result = await fn(input, { initData });
    send(res, 200, { ok: true, result: result ?? null });
  } catch (e) {
    if (e?.constructor?.name === 'EndpointError') return send(res, 400, { ok: false, description: e.description ?? e.message, parameters: e.parameters ?? {} });
    console.error('endpoint', name, e);
    send(res, 500, { ok: false, description: 'Internal error' });
  }
}

function onStatic(req, res) {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  p = normalize(p).replace(/^(\.\.[/\\])+/, '');
  let f = join(STATIC, p);
  if (!f.startsWith(STATIC) || !existsSync(f) || statSync(f).isDirectory()) f = join(STATIC, 'index.html'); // SPA
  const ext = extname(f);
  res.writeHead(200, { 'content-type': TYPES[ext] ?? 'application/octet-stream',
    'cache-control': ext === '.html' ? 'no-cache' : p.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600' });
  createReadStream(f).pipe(res);
}

http.createServer((req, res) => {
  const m = /^\/api\/([^/?]+)/.exec(req.url || '');
  if (m && req.method === 'POST') return onApi(req, res, m[1]).catch((e) => { console.error(e); send(res, 500, { ok: false }); });
  if (req.method === 'GET' || req.method === 'HEAD') return onStatic(req, res);
  send(res, 405, { ok: false });
}).listen(PORT, '127.0.0.1', () => console.log('HTTP на 127.0.0.1:' + PORT));

// ---------- бот: long polling ----------
const UPDATES = ['message', 'callback_query', 'my_chat_member', 'pre_checkout_query'];
async function poll() {
  await api.deleteWebhook({ drop_pending_updates: false }).catch((e) => console.warn('deleteWebhook', e.description));
  // меню, команды и описание бота — с адресом мини-приложения на этом сервере
  const ops = await mod(join(ROOT, 'tgcloud/endpoints/ops.js'));
  await ops({ action: 'setup_bot' }, { initData: { user: { id: OPERATOR_ID } } }).catch((e) => console.warn('setup_bot', e.description ?? e.message));
  let offset = 0;
  for (;;) {
    let ups = [];
    try { ups = await api.getUpdates({ offset, timeout: 30, allowed_updates: UPDATES }); }
    catch (e) { console.warn('getUpdates', e.description ?? e.message); await new Promise((r) => setTimeout(r, 3000)); continue; }
    for (const u of ups) {
      offset = u.update_id + 1;
      const type = Object.keys(u).find((k) => k !== 'update_id');
      const fn = await mod(join(ROOT, 'tgcloud/handlers', type + '.js'));
      if (!fn) continue;
      try { await fn(u[type], { update: u }); } catch (e) { console.error('handler', type, e?.description ?? e); }
    }
  }
}
poll();

// ---------- фоновый тик ----------
let busy = false;
setInterval(async () => {
  if (busy) return; busy = true;
  try { await sync(db, api, InputFile, { limit: 3 }); } catch (e) { console.warn('tick', e?.message ?? e); }
  busy = false;
}, 2000);
