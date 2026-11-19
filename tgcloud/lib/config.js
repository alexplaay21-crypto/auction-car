// lib/config.js — настройки бота. BOT_USERNAME и APP_SHORT_NAME нужны для ссылок
// на Mini App из групп (t.me/<бот>?startapp=…).
export const APP_NAME = 'Car Auction';
export const BOT_USERNAME = 'binaiobot';
export const MINI_APP_URL = 'https://app9098990437.tgcloud.ai/';
export const ADMIN_IDS = [6714200331];
export const OPERATOR_ID = 777000; // служебный id для ops-команд из консоли
export const appLink = (param = '') => `https://t.me/${BOT_USERNAME}?startapp=${encodeURIComponent(param || 'play')}`;
