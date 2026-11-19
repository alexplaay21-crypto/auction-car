// Связь с Telegram и серверными функциями (endpoints) — те же данные, что у бота.
import { t } from './i18n';
import { fx } from './sound';
declare global {
  interface Window { Telegram?: any }
}

export const tg: any = window.Telegram?.WebApp;

export class ApiError extends Error {
  code: string;
  constructor(code: string, message?: string) { super(message || code); this.code = code; }
}

const MESSAGES: Record<string, string> = {
  INSUFFICIENT_FUNDS: 'Не хватает денег',
  BID_TOO_LOW: 'Ставка должна быть выше текущей хотя бы на шаг',
  AUCTION_OVER: 'Контейнер уже закрыт — ждём следующий',
  NOT_IN_ROOM: 'Сначала войди в комнату',
  ROOM_BUSY: 'Комнаты переполнены, попробуй ещё раз',
  GROUP_AUCTION_OFF: 'В этой группе аукцион выключен',
  USER_BANNED: 'Аккаунт заблокирован',
  CAR_NOT_FOUND: 'Машина не найдена или уже продана',
  CAR_SOLD: 'Машина уже продана',
  GARAGE_FULL: 'Гараж покупателя полон',
  GARAGE_MAX: 'Гараж уже максимального размера',
  BAD_TIER: 'Это расширение уже куплено',
  NO_CONTAINER: 'Такого контейнера нет',
  CONTAINER_EMPTY: 'В контейнере нет машин',
  RECIPIENT_NOT_FOUND: 'Игрок не найден — он должен хотя бы раз зайти в игру',
  SELF_TRANSFER: 'Нельзя переводить самому себе',
  BAD_AMOUNT: 'Неверная сумма',
  BONUS_TAKEN: 'Бонус уже получен',
  BONUS_TOO_EARLY: 'Бонус можно брать раз в 4 часа',
  BONUS_RICH: 'Бонус только при балансе меньше $50 000 (VIP — $100 000)',
  MARKET_RARITY: 'На рынке продаются только эпические и легендарные машины',
  BP_NO_SEASON: 'Сезон Battle Pass сейчас не идёт',
  BP_LOCKED: 'Этот уровень ещё не открыт',
  BP_NOT_PREMIUM: 'Нужен премиум Battle Pass',
  SKILL_MAX: 'Навык уже максимальный',
  BAD_STAKE: 'Ставка в гонке — от $100 до $100 000',
  RACE_CLOSED: 'Вызов уже закрыт',
  SELF_RACE: 'Нельзя принять свой вызов',
  HOST_CAR_GONE: 'У соперника больше нет этой машины — вызов отменён',
  TOO_MANY_RACES: 'Не больше 3 открытых вызовов',
  LISTING_CLOSED: 'Лот уже продан или снят',
  SELF_BUY: 'Это твой лот',
  SELF_FRIEND: 'Нельзя добавить себя',
  ALREADY_VIP: 'VIP у тебя уже есть',
  BUYER_NOT_FOUND: 'Покупатель не найден — он должен хотя бы раз зайти в игру',
  OFFER_EXISTS: 'На эту машину уже есть активное предложение',
  OFFER_NOT_FOUND: 'Предложение не найдено',
  OFFER_CLOSED: 'Предложение уже закрыто',
  OFFER_EXPIRED: 'Предложение истекло',
  PROMO_NOT_FOUND: 'Промокод не найден',
  PROMO_EXPIRED: 'Промокод истёк',
  PROMO_LIMIT: 'Промокод больше не действует',
  PROMO_USED: 'Ты уже активировал этот промокод',
  ITEM_UNAVAILABLE: 'Товар недоступен',
  LIMIT_REACHED: 'Лимит покупок исчерпан',
  SHOP_CLOSED: 'Магазин закрыт',
  NOT_ADMIN: 'Нужны права администратора',
  OWNER_ONLY: 'Только для владельца',
  BAD_INPUT: 'Проверь заполненные поля',
  BAD_SETTING: 'Эту настройку нельзя изменить',
  IMAGE_TOO_BIG: 'Фото слишком большое',
  BAD_CODE: 'Код: 3–32 латинские буквы или цифры',
  CANNOT_TARGET_OWNER: 'Нельзя применить к владельцу',
  USER_NOT_FOUND: 'Игрок не найден',
  NO_TELEGRAM: 'Открой игру внутри Telegram',
};

export function errorText(e: any): string {
  if (e && typeof e.code === 'string') return t(MESSAGES[e.code] ?? 'Не получилось, попробуй ещё раз');
  return t('Ошибка соединения. Попробуй ещё раз.');
}

export function call<T = any>(name: string, input: Record<string, unknown> = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const s = tg?.Serverless;
    if (!s?.call) return reject(new ApiError('NO_TELEGRAM'));
    s.call(name, input, (err: any, result: T) => {
      if (err) reject(new ApiError(err.parameters?.code ?? err.type ?? 'ERROR', err.message));
      else resolve(result);
    });
  });
}

export function clientId(): string {
  const c: any = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// Отклик на действие: звук и вибрация (их можно выключить в настройках).
export function haptic(kind: 'success' | 'error' | 'light' | 'heavy' = 'light') {
  if (kind === 'success') fx.coin();
  else if (kind === 'error') fx.error();
  else fx.tap();
}

export function toast(text: string) {
  window.dispatchEvent(new CustomEvent('toast', { detail: text }));
}

export function share(url: string, text: string) {
  tg?.openTelegramLink?.(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
}
