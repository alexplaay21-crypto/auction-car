// stars.js — магазин за Telegram Stars и сообщения игроков о проблемах и идеях.
// Счёт: createInvoiceLink (Mini App) или sendInvoice (бот) с payload «st:товар:игрок:сезон».
// pre_checkout_query проверяет, что товар ещё можно купить; successful_payment выдаёт его.
import { NOW } from './sql.js';
import { GameError, getUser, settings } from './engine.js';
import { currentSeason } from './engine3.js';
import { money } from './views.js';
import { DELUXE_LEVELS } from './ddl6.js';

async function bpState(db, uid) {
  const se = await currentSeason(db);
  if (!se) return { se: null };
  const pr = (await db.get('SELECT xp, premium, deluxe FROM bp_progress WHERE user_id = :u AND season = :s', { ':u': uid, ':s': se.id })) ?? { xp: 0, premium: 0, deluxe: 0 };
  const level = Math.min(se.levels, Math.floor(pr.xp / se.xp_level));
  return { se, premium: pr.premium === 1, deluxe: pr.deluxe === 1, level, max: se.levels };
}

// Почему товар сейчас нельзя купить (null — можно).
function blocker(p, u, b) {
  if (!p || !p.is_active) return 'ITEM_UNAVAILABLE';
  if (p.kind === 'vip' && u.is_vip === 1) return 'ALREADY_VIP';
  if (['bp', 'bpdx', 'bplvl'].includes(p.kind) && !b.se) return 'BP_NO_SEASON';
  if (p.kind === 'bp' && b.premium) return 'BP_ALREADY';
  if (p.kind === 'bpdx' && !b.premium) return 'BP_NEED_PREMIUM';
  if (p.kind === 'bpdx' && b.deluxe) return 'BP_DELUXE_ALREADY';
  if ((p.kind === 'bpdx' || p.kind === 'bplvl') && b.level >= b.max) return 'BP_MAX_LEVEL';
  return null;
}

export async function starProducts(db, uid) {
  const list = await db.all('SELECT * FROM star_products WHERE is_active = 1 ORDER BY sort, id');
  const u = await getUser(db, uid);
  const b = await bpState(db, uid);
  const car = b.se?.prem_car_id ? await db.get('SELECT * FROM cars WHERE id = :c', { ':c': b.se.prem_car_id }) : null;
  const base = list.filter((p) => p.kind === 'money').reduce((m, p) => Math.min(m, p.money / p.stars), Infinity);
  return list.map((p) => ({
    ...p,
    // выгода относительно самого маленького пакета, в процентах
    bonus_pct: p.kind === 'money' && Number.isFinite(base) ? Math.round(((p.money / p.stars) / base - 1) * 100) : 0,
    owned: p.kind === 'vip' ? u.is_vip === 1 : p.kind === 'bp' ? b.premium : p.kind === 'bpdx' ? b.deluxe : false,
    blocked: blocker(p, u, b),
    ...(p.kind === 'bp' ? { season: b.se?.name ?? null, car } : {}),
  }));
}

export function productTitle(p, se) {
  if (p.kind === 'money') return `${money(p.money)} на баланс`;
  if (p.kind === 'vip') return 'VIP навсегда';
  if (p.kind === 'bpdx') return 'Battle Pass Делюкс';
  if (p.kind === 'bplvl') return 'Уровень Battle Pass';
  return `Премиум Battle Pass${se ? ' · ' + se.name : ''}`;
}
function productDescription(p, st, car) {
  if (p.kind === 'money') return `Игровая валюта Car Auction: ${money(p.money)} сразу на баланс.`;
  if (p.kind === 'vip') return `+${st.garage_vip_bonus} мест в гараже, ниже комиссии, бонус ${money(st.daily_bonus_vip)} раз в 4 часа. Навсегда.`;
  if (p.kind === 'bpdx') return `+${DELUXE_LEVELS} уровней Battle Pass сразу. Только для владельцев премиума.`;
  if (p.kind === 'bplvl') return 'Сразу открывает следующий уровень Battle Pass.';
  return `${car ? `Машина ${car.name} сразу в гараж + ` : ''}премиум-награды всех уровней сезона.`;
}

// Параметры счёта (одинаковые для бота и Mini App).
export async function invoiceParams(db, uid, productId) {
  const p = await db.get('SELECT * FROM star_products WHERE id = :p', { ':p': String(productId ?? '') });
  const b = await bpState(db, uid);
  const why = blocker(p, await getUser(db, uid), b);
  if (why) throw new GameError(why);
  const st = await settings(db);
  const car = p.kind === 'bp' && b.se?.prem_car_id ? await db.get('SELECT name FROM cars WHERE id = :c', { ':c': b.se.prem_car_id }) : null;
  return {
    title: productTitle(p, b.se).slice(0, 32),
    description: productDescription(p, st, car).slice(0, 255),
    payload: `st:${p.id}:${uid}:${b.se?.id ?? 0}`,
    currency: 'XTR',
    prices: [{ label: productTitle(p, b.se).slice(0, 32), amount: p.stars }],
  };
}

function parsePayload(s) {
  const m = /^st:([a-z0-9_]+):(\d+):(\d+)$/.exec(String(s ?? ''));
  return m ? { product: m[1], uid: Number(m[2]), season: Number(m[3]) || null } : null;
}

const WHY = {
  ALREADY_VIP: 'VIP у тебя уже есть.', BP_ALREADY: 'Премиум этого сезона у тебя уже есть.', BP_NO_SEASON: 'Сезон Battle Pass сейчас не идёт.',
  BP_NEED_PREMIUM: 'Делюкс доступен только после покупки премиума.', BP_DELUXE_ALREADY: 'Делюкс уже куплен.', BP_MAX_LEVEL: 'Все уровни уже открыты.',
};

// pre_checkout_query: последний шанс отказать до списания звёзд.
export async function precheck(db, q) {
  const pl = parsePayload(q.invoice_payload);
  if (!pl || pl.uid !== Number(q.from?.id) || q.currency !== 'XTR') return { ok: false, error: 'Счёт устарел — открой магазин заново.' };
  const p = await db.get('SELECT * FROM star_products WHERE id = :p', { ':p': pl.product });
  if (!p || p.stars !== Number(q.total_amount)) return { ok: false, error: 'Цена изменилась — открой магазин заново.' };
  const b = await bpState(db, pl.uid);
  const why = blocker(p, await getUser(db, pl.uid), b);
  if (why) return { ok: false, error: WHY[why] ?? 'Товар сейчас недоступен.' };
  if (['bp', 'bpdx', 'bplvl'].includes(p.kind) && b.se.id !== pl.season) return { ok: false, error: 'Сезон Battle Pass сменился — открой магазин заново.' };
  return { ok: true };
}

// successful_payment: звёзды уже списаны. Если товар успел стать недоступен (VIP уже есть,
// сезон закончился) — платёж записывается как возврат, и бот возвращает звёзды.
export async function deliver(db, uid, sp) {
  const pl = parsePayload(sp.invoice_payload);
  const charge = String(sp.telegram_payment_charge_id ?? '');
  if (!charge) throw new GameError('BAD_INPUT');
  const done = await db.get('SELECT * FROM star_payments WHERE charge_id = :c', { ':c': charge });
  if (done) return { ...done, duplicate: true };
  const stars = Number(sp.total_amount) || 0;
  const p = pl ? await db.get('SELECT * FROM star_products WHERE id = :p', { ':p': pl.product }) : null;
  let kind = p?.kind ?? 'refund', amount = p?.kind === 'money' ? p.money : 0, season = null;
  if (p && p.kind !== 'money') {
    const b = await bpState(db, uid);
    const why = blocker({ ...p, is_active: 1 }, await getUser(db, uid), b);
    if (why || (p.kind !== 'vip' && b.se.id !== pl.season)) kind = 'refund';
    else if (p.kind !== 'vip') season = b.se.id;
  }
  await db.run(`INSERT INTO star_payments (charge_id, user_id, product, kind, stars, money, season, created_at)
    VALUES (:c, :u, :p, :k, :s, :m, :se, ${NOW}) ON CONFLICT (charge_id) DO NOTHING`,
  { ':c': charge, ':u': uid, ':p': p?.id ?? pl?.product ?? '?', ':k': kind, ':s': stars, ':m': kind === 'money' ? amount : 0, ':se': season });
  const car = p?.kind === 'bp' && kind === 'bp' ? await db.get('SELECT c.* FROM bp_seasons s JOIN cars c ON c.id = s.prem_car_id WHERE s.id = :s', { ':s': season }) : null;
  return { product: p?.id, kind, money: kind === 'money' ? amount : 0, stars, refund: kind === 'refund', charge, car };
}

export function deliveredText(r) {
  if (r.duplicate) return '✅ Эта покупка уже зачислена.';
  if (r.refund) return '↩️ Этот товар у тебя уже есть или стал недоступен — звёзды возвращены.';
  if (r.kind === 'vip') return '👑 <b>VIP навсегда активирован!</b> Больше мест в гараже, ниже комиссии и бонус побольше.';
  if (r.kind === 'bp') return `🏆 <b>Премиум Battle Pass открыт!</b>${r.car ? ` Машина <b>${r.car.name}</b> уже в гараже.` : ''} Забирай премиум-награды в разделе Battle Pass.`;
  if (r.kind === 'bpdx') return `💎 <b>Делюкс открыт:</b> +${DELUXE_LEVELS} уровней Battle Pass!`;
  if (r.kind === 'bplvl') return '⬆️ <b>Уровень Battle Pass открыт!</b> Забери награду.';
  return `💰 <b>+${money(r.money)}</b> на баланс. Спасибо за покупку!`;
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
