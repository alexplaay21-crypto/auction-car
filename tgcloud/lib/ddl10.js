// ddl10.js — миграция 25: экономика под заводские цены машин (MSRP). Машины подорожали примерно
// в 5 раз, поэтому в той же пропорции ×5: балансы игроков (через журнал), бонусы, стартовые деньги,
// рефералы, ставки в гонках, шаг ставки, расширение гаража, навык, оформление профиля,
// пакеты за звёзды, награды Battle Pass, лоты магазина, промокоды и открытые лоты рынка.
// Настройки и справочники умножаются один раз (миграция выполняется один раз); навык задаётся
// абсолютно из таблицы цен кода, где он уже ×5.
import { NOW } from './sql.js';
import { skillPrice, SKILL_MAX, findT } from './ddl3.js';

export const ECON = 5;
const MONEY_SETTINGS = ['start_balance', 'bet_step', 'daily_bonus', 'daily_bonus_vip', 'bonus_cap', 'bonus_cap_vip', 'vip_price', 'bp_price',
  'ref_inviter', 'ref_invited', 'ref_first_purchase', 'race_min_stake', 'race_max_stake'];

function skillRows() {
  const out = [];
  let cum = 0;
  for (let n = 1; n <= SKILL_MAX; n++) { cum += skillPrice(n); out.push(`UPDATE skill_prices SET price = ${skillPrice(n)}, cum = ${cum} WHERE n = ${n}`); }
  return out;
}

export const MIGRATION_25 = [
  // деньги игроков: запись в журнал (+4× баланса), затем баланс ×5
  `INSERT INTO ledger (op_id, user_id, kind, delta, balance_after, ref, created_at)
     SELECT 'econ5:' || id, id, 'econ_rescale', balance * ${ECON - 1}, balance * ${ECON}, NULL, ${NOW} FROM users WHERE balance > 0`,
  `UPDATE users SET balance = balance * ${ECON} WHERE balance > 0`,
  `UPDATE settings SET v = v * ${ECON} WHERE k IN (${MONEY_SETTINGS.map((k) => `'${k}'`).join(', ')})`,
  `UPDATE garage_tiers SET price = price * ${ECON}`,
  `UPDATE cosmetics SET price = price * ${ECON}`,
  `UPDATE star_products SET money = money * ${ECON} WHERE kind = 'money'`,
  `UPDATE bp_levels SET free_value = free_value * ${ECON} WHERE free_kind = 'money'`,
  `UPDATE bp_levels SET prem_value = prem_value * ${ECON} WHERE prem_kind = 'money'`,
  `UPDATE bp_seasons SET price = price * ${ECON}`,
  `UPDATE shop_lots SET price = price * ${ECON}, money = money * ${ECON}`,
  `UPDATE promo_codes SET money = money * ${ECON}`,
  // цена лота неизменяема триггером — на время пересчёта он снимается и ставится обратно
  'DROP TRIGGER IF EXISTS listings_bu',
  `UPDATE market_listings SET price = price * ${ECON} WHERE status = 'open'`,
  findT('listings_bu'),
  // предложения игроку живут 15 минут — старые просто истекают
  `UPDATE sale_offers SET status = 'expired', resolved_at = ${NOW} WHERE status = 'pending'`,
  ...skillRows(),
];
