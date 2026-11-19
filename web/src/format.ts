export const money = (n: number | null | undefined) =>
  n == null ? '—' : '$' + Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ');

export const short = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1_000_000) return '$' + (n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1).replace('.', ',') + ' млн';
  if (a >= 10_000) return '$' + Math.round(n / 1000) + 'K';
  return money(n);
};

export const who = (u: any) => (u?.username ? '@' + u.username : u?.first_name || 'игрок');

export const RARITY: Record<string, { name: string; icon: string; color: string }> = {
  common: { name: 'Обычная', icon: '⚪', color: '#9aa4b1' },
  rare: { name: 'Редкая', icon: '🔵', color: '#3d8bff' },
  epic: { name: 'Эпическая', icon: '🟣', color: '#a95cff' },
  mythic: { name: 'Мифическая', icon: '🟡', color: '#ffb800' },
};
export const RARITIES = ['common', 'rare', 'epic', 'mythic'];

export const ago = (t: number, now = Date.now() / 1000) => {
  const s = Math.max(0, Math.floor(now - t));
  if (s < 60) return `${s} с назад`;
  if (s < 3600) return `${Math.floor(s / 60)} мин назад`;
  if (s < 86400) return `${Math.floor(s / 3600)} ч назад`;
  return `${Math.floor(s / 86400)} д назад`;
};

export const LEDGER: Record<string, string> = {
  start: 'Стартовый капитал', bid: 'Ставка', bid_refund: 'Возврат ставки', auto_sell: 'Авто-продажа (гараж полон)',
  sell_state: 'Продажа машины', sell_player: 'Продажа игроку', buy_car: 'Покупка у игрока', transfer_out: 'Перевод',
  transfer_in: 'Перевод от игрока', daily_bonus: 'Ежедневный бонус', vip: 'VIP', garage_upgrade: 'Расширение гаража',
  ref_inviter: 'Друг по приглашению', ref_invited: 'Бонус за приглашение', ref_first_purchase: 'Первая покупка друга',
  promo: 'Промокод', shop: 'Магазин', shop_money: 'Магазин: деньги', admin_adjust: 'Администратор',
};
