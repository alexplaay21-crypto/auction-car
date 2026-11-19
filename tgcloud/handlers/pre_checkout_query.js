// handlers/pre_checkout_query.js — Telegram спрашивает перед списанием звёзд, можно ли продать товар.
import { api, db } from 'sdk';
import { precheck } from '../lib/stars.js';

export default async function (q) {
  let r;
  try { r = await precheck(db, q); } catch (e) { console.warn('precheck', String(e?.message ?? e)); r = { ok: false, error: 'Магазин временно недоступен, попробуй позже.' }; }
  await api.answerPreCheckoutQuery({ pre_checkout_query_id: q.id, ok: r.ok, ...(r.ok ? {} : { error_message: r.error }) });
}
