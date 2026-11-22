import { t } from './i18n';
export const money = (n: number | null | undefined) =>
  n == null ? '—' : '$' + Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ');

export const short = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1_000_000) return '$' + (n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1).replace('.', ',') + ' млн';
  if (a >= 10_000) return '$' + Math.round(n / 1000) + 'K';
  return money(n);
};

export const who = (u: any) => (u?.username ? '@' + u.username : u?.first_name || t('игрок'));

const R = (name: string, icon: string, color: string) => ({ get name() { return t(name); }, icon, color });
export const RARITY: Record<string, { name: string; icon: string; color: string }> = {
  common: R('Обычная', '⚪', '#a3acbd'),
  rare: R('Редкая', '🔵', '#3d9bff'),
  epic: R('Эпическая', '🟣', '#b46bff'),
  mythic: R('Легендарная', '🟡', '#ffc23d'),
  mystic: R('Мистическая', '🔴', '#ff3b4d'),
};
export const RARITIES = ['common', 'rare', 'epic', 'mythic', 'mystic'];
// порядок от самой ценной (для сортировки)
export const RARITY_RANK: Record<string, number> = { mystic: 5, mythic: 4, epic: 3, rare: 2, common: 1 };

export const ago = (ts: number, now = Date.now() / 1000) => {
  const s = Math.max(0, Math.floor(now - ts));
  if (s < 60) return t('{n} с назад', { n: s });
  if (s < 3600) return t('{n} мин назад', { n: Math.floor(s / 60) });
  if (s < 86400) return t('{n} ч назад', { n: Math.floor(s / 3600) });
  return t('{n} д назад', { n: Math.floor(s / 86400) });
};
export const left = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  if (s >= 86400) return t('{d} д {h} ч', { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600) });
  if (s >= 3600) return t('{h} ч {m} мин', { h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60) });
  return t('{m} мин {s} с', { m: Math.floor(s / 60), s: s % 60 });
};

export const LEDGER: Record<string, string> = {
  start: 'Стартовый капитал', stars: 'Покупка за Stars', cosmetic: 'Оформление профиля', bid: 'Ставка', bid_refund: 'Возврат ставки', auto_sell: 'Авто-продажа (гараж полон)',
  sell_state: 'Продажа машины', sell_player: 'Продажа игроку', buy_car: 'Покупка у игрока', transfer_out: 'Перевод',
  transfer_in: 'Перевод от игрока', daily_bonus: 'Ежедневный бонус', vip: 'VIP', garage_upgrade: 'Расширение гаража',
  ref_inviter: 'Друг по приглашению', ref_invited: 'Бонус за приглашение', ref_first_purchase: 'Первая покупка друга',
  promo: 'Промокод', shop: 'Магазин', shop_money: 'Магазин: деньги', admin_adjust: 'Администратор',
  market_buy: 'Покупка на рынке', market_sell: 'Продажа на рынке', race: 'Гонка', race_win: 'Выигрыш в гонке', race_refund: 'Возврат ставки гонки',
  skill: 'Навык гонщика', bp: 'Battle Pass', bp_reward: 'Награда Battle Pass',
};
