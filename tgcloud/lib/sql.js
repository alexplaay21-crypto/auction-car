// lib/sql.js — общие фрагменты SQL для триггеров.
//
// Платформа выполняет каждый запрос атомарно, но не даёт открыть транзакцию (BEGIN
// запрещён). Поэтому каждая денежная операция — ОДНА команда INSERT или UPDATE, а все
// её последствия (списания, начисления, журнал, статистика) выполняют триггеры внутри
// того же запроса. Любая ошибка (RAISE или нарушенный CHECK) откатывает запрос целиком.

export const NOW = '(SELECT now FROM v_now)';
export const DAY = `(${NOW} / 86400)`;
export const S = (k) => `(SELECT v FROM settings WHERE k = '${k}')`;
export const VIP = (u) => `(SELECT is_vip FROM users WHERE id = ${u})`;
// комиссия в б.п. для обычного игрока / VIP
export const RATE = (name, u) => `(CASE WHEN ${VIP(u)} = 1 THEN ${S(name + '_vip_bps')} ELSE ${S(name + '_bps')} END)`;
export const OWNED = (u) => `(SELECT count(*) FROM user_cars WHERE user_id = ${u} AND status = 'owned')`;
export const CAPACITY = (u) => `(SELECT garage_capacity FROM users WHERE id = ${u})`;

// Проводка: изменение баланса + запись в журнал с итоговым балансом. Нули не пишутся.
// Баланс не может уйти в минус — CHECK (balance >= 0) откатит всю операцию.
export function post(op, user, kind, delta, ref = 'NULL') {
  return `
    UPDATE users SET balance = balance + (${delta}) WHERE id = ${user};
    INSERT INTO ledger (op_id, user_id, kind, delta, balance_after, ref, created_at)
      SELECT ${op}, ${user}, '${kind}', (${delta}), balance, ${ref}, ${NOW} FROM users
      WHERE id = ${user} AND (${delta}) <> 0;`;
}

// Машина в гараж: если гараж полон — сразу продаётся с комиссией быстрой продажи.
// src + ref однозначно определяют выдачу (уникальный индекс), поэтому повторно
// одна и та же награда не выдаётся. when — условие выдачи (SQL).
export function giveCar(op, user, car, src, ref, { paid = '0', when = '1' } = {}) {
  const full = `(${OWNED(user)} >= ${CAPACITY(user)})`;
  const autoPrice = `((SELECT price FROM cars WHERE id = ${car}) * (10000 - ${RATE('comm_quick', user)}) / 10000)`;
  const row = `(SELECT id FROM user_cars WHERE source = '${src}' AND source_ref = ${ref})`;
  return `
    INSERT INTO user_cars (user_id, car_id, source, source_ref, obtained_at, paid, status, sold_amount, sold_at)
      SELECT ${user}, ${car}, '${src}', ${ref}, ${NOW}, ${paid},
             CASE WHEN ${full} THEN 'sold' ELSE 'owned' END,
             CASE WHEN ${full} THEN ${autoPrice} END,
             CASE WHEN ${full} THEN ${NOW} END
      WHERE ${when};
    ${post(op, user, 'auto_sell', `COALESCE((SELECT sold_amount FROM user_cars WHERE source = '${src}' AND source_ref = ${ref}), 0)`, row)}
    UPDATE users SET cars_obtained = cars_obtained + 1 WHERE id = ${user} AND ${when};`;
}
