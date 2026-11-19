// stars.js — магазин за Telegram Stars и сообщения игроков о проблемах и идеях.
// Счёт: createInvoiceLink (Mini App) или sendInvoice (бот) с payload «st:товар:игрок:сезон».
// pre_checkout_query проверяет, что товар ещё можно купить; successful_payment выдаёт его.
import { NOW } from './sql.js';
import { GameError, getUser, settings } from './engine.js';
import { currentSeason } from './engine3.js';
import { money } from './views.js';

export async function starProducts(db, uid) {
  const list = await db.all('SELECT * FROM star_products WHERE is_active = 1 ORDER BY sort, id');
  const u = await getUser(db, uid);
  const se = await currentSeason(db);
  const prem = se ? (await db.get('SELECT premium FROM bp_progress WHERE user_id = :u AND season = :s', { ':u': uid, ':s': se.id }))?.premium === 1 : false;
  const base = list.filter((p) => p.kind === 'money').reduce((m, p) => Math.min(m, p.money / p.stars), Infinity);
  return list.map((p) => ({
    ...p,
    // выгода относительно самого маленького пакета, в процентах
    bonus_pct: p.kind === 'money' && Number.isFinite(base) ? Math.round(((p.money / p.stars) / base - 1) * 100) : 0,
    owned: p.kind === 'vip' ? u.is_vip === 1 : p.kind === 'bp' ? prem : false,
    available: p.kind === 'bp' ? !!se && !prem : p.kind === 'vip' ? u.is_vip !== 1 : true,
    season: p.kind === 'bp' ? se?.name ?? null : undefined,
  }));
}

export function productTitle(p, se) {
  if (p.kind === 'money') return `${money(p.money)} на баланс`;
  if (p.kind === 'vip') return 'VIP навсегда';
  return `Премиум Battle Pass${se ? ' · ' + se.name : ''}`;
}
function productDescription(p, st) {
  if (p.kind === 'money') return `Игровая валюта Car Auction: ${money(p.money)} сразу на баланс.`;
  if (p.kind === 'vip') return `+${st.garage_vip_bonus} мест в гараже, ниже комиссии, бонус ${money(st.daily_bonus_vip)} раз в 4 часа. Навсегда.`;
  return 'Премиум-награды всех уровней текущего сезона Battle Pass: машины, контейнеры и навык.';
}

async function checkAvailable(db, uid, p) {
  if (!p || !p.is_active) throw new GameError('ITEM_UNAVAILABLE');
  const u = await getUser(db, uid);
  if (p.kind === 'vip' && u.is_vip === 1) throw new GameError('ALREADY_VIP');
  let se = null;
  if (p.kind === 'bp') {
    se = await currentSeason(db);
    if (!se) throw new GameError('BP_NO_SEASON');
    const prem = await db.get('SELECT premium FROM bp_progress WHERE user_id = :u AND season = :s', { ':u': uid, ':s': se.id });
    if (prem?.premium === 1) throw new GameError('BP_ALREADY');
  }
  return se;
}

// Параметры счёта (одинаковые для бота и Mini App).
export async function invoiceParams(db, uid, productId) {
  const p = await db.get('SELECT * FROM star_products WHERE id = :p', { ':p': String(productId ?? '') });
  const se = await checkAvailable(db, uid, p);
  const st = await settings(db);
  return {
    title: productTitle(p, se).slice(0, 32),
    description: productDescription(p, st).slice(0, 255),
    payload: `st:${p.id}:${uid}:${se?.id ?? 0}`,
    currency: 'XTR',
    prices: [{ label: productTitle(p, se).slice(0, 32), amount: p.stars }],
  };
}

function parsePayload(s) {
  const m = /^st:([a-z0-9_]+):(\d+):(\d+)$/.exec(String(s ?? ''));
  return m ? { product: m[1], uid: Number(m[2]), season: Number(m[3]) || null } : null;
}

// pre_checkout_query: последний шанс отказать до списания звёзд.
export async function precheck(db, q) {
  const pl = parsePayload(q.invoice_payload);
  if (!pl || pl.uid !== Number(q.from?.id) || q.currency !== 'XTR') return { ok: false, error: 'Счёт устарел — открой магазин заново.' };
  const p = await db.get('SELECT * FROM star_products WHERE id = :p', { ':p': pl.product });
  if (!p || p.stars !== Number(q.total_amount)) return { ok: false, error: 'Цена изменилась — открой магазин заново.' };
  try {
    const se = await checkAvailable(db, pl.uid, p);
    if (p.kind === 'bp' && se.id !== pl.season) return { ok: false, error: 'Сезон Battle Pass сменился — открой магазин заново.' };
  } catch (e) {
    const msg = { ALREADY_VIP: 'VIP у тебя уже есть.', BP_ALREADY: 'Премиум этого сезона у тебя уже есть.', BP_NO_SEASON: 'Сезон Battle Pass сейчас не идёт.' }[e.code];
    return { ok: false, error: msg ?? 'Товар сейчас недоступен.' };
  }
  return { ok: true };
}

// successful_payment: звёзды уже списаны — товар выдаётся всегда. Если он стал недоступен
// (VIP уже есть, сезон закончился), вместо него начисляется его цена в игровой валюте.
export async function deliver(db, uid, sp) {
  const pl = parsePayload(sp.invoice_payload);
  const charge = String(sp.telegram_payment_charge_id ?? '');
  if (!charge) throw new GameError('BAD_INPUT');
  const done = await db.get('SELECT * FROM star_payments WHERE charge_id = :c', { ':c': charge });
  if (done) return { ...done, duplicate: true };
  const stars = Number(sp.total_amount) || 0;
  const p = pl ? await db.get('SELECT * FROM star_products WHERE id = :p', { ':p': pl.product }) : null;
  const st = await settings(db);
  let kind = p?.kind ?? 'money', amount = p?.money ?? stars * 500, season = null, replaced = false;
  if (kind === 'vip' && (await getUser(db, uid)).is_vip === 1) { kind = 'money'; amount = st.vip_price; replaced = true; }
  if (kind === 'bp') {
    const se = await currentSeason(db);
    const prem = se ? (await db.get('SELECT premium FROM bp_progress WHERE user_id = :u AND season = :s', { ':u': uid, ':s': se.id }))?.premium === 1 : true;
    if (!se || se.id !== pl.season || prem) { kind = 'money'; amount = se?.price ?? st.bp_price ?? 150_000; replaced = true; }
    else season = se.id;
  }
  await db.run(`INSERT INTO star_payments (charge_id, user_id, product, kind, stars, money, season, created_at)
    VALUES (:c, :u, :p, :k, :s, :m, :se, ${NOW}) ON CONFLICT (charge_id) DO NOTHING`,
  { ':c': charge, ':u': uid, ':p': p?.id ?? pl?.product ?? '?', ':k': kind, ':s': stars, ':m': kind === 'money' ? amount : 0, ':se': season });
  return { product: p?.id, kind, money: kind === 'money' ? amount : 0, stars, replaced };
}

export function deliveredText(r) {
  if (r.duplicate) return '✅ Эта покупка уже зачислена.';
  if (r.kind === 'vip') return '👑 <b>VIP навсегда активирован!</b> Больше мест в гараже, ниже комиссии и бонус побольше.';
  if (r.kind === 'bp') return '🏆 <b>Премиум Battle Pass открыт!</b> Забирай премиум-награды в разделе Battle Pass.';
  return `💰 <b>+${money(r.money)}</b> на баланс${r.replaced ? ' (товар уже был у тебя — начислили его стоимость)' : ''}. Спасибо за покупку!`;
}

// ---------- сообщения о проблемах и идеях ----------
export async function sendFeedback(db, uid, kind, text) {
  const k = kind === 'bug' ? 'bug' : 'idea';
  const r = await db.run(`INSERT INTO feedback (user_id, kind, text, created_at) VALUES (:u, :k, :t, ${NOW})`, { ':u': uid, ':k': k, ':t': String(text ?? '').trim().slice(0, 1000) });
  return Number(r.lastInsertRowid);
}
export async function myFeedback(db, uid) {
  return db.all('SELECT * FROM feedback WHERE user_id = :u ORDER BY id DESC LIMIT 20', { ':u': uid });
}
export async function feedbackList(db, status = 'new') {
  return db.all(`SELECT f.*, u.username, u.first_name FROM feedback f LEFT JOIN users u ON u.id = f.user_id
    WHERE (:s = 'all' OR f.status = :s) ORDER BY f.id DESC LIMIT 100`, { ':s': ['new', 'done', 'all'].includes(status) ? status : 'new' });
}
export async function answerFeedback(db, adminId, id, answer) {
  const a = String(answer ?? '').trim().slice(0, 1000) || null;
  await db.run(`UPDATE feedback SET answer = COALESCE(:a, answer), status = 'done', answered_by = :b, answered_at = ${NOW} WHERE id = :i`,
    { ':a': a, ':b': adminId, ':i': Number(id) || 0 });
}
