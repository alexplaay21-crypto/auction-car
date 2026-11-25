// lib/config.js — настройки бота. BOT_USERNAME и APP_SHORT_NAME нужны для ссылок
// на Mini App из групп (t.me/<бот>?startapp=…).
export const APP_NAME = 'Car Auction';
// на своём сервере адрес и имя бота задаются в deploy/server.env (на платформе process нет — берутся значения ниже)
const ENV = globalThis.process?.env ?? {};
export const BOT_USERNAME = ENV.BOT_USERNAME || 'binaiobot';
export const MINI_APP_URL = ENV.MINI_APP_URL ? ENV.MINI_APP_URL.replace(/\/?$/, '/') : 'https://app9098990437.tgcloud.ai/';
export const ADMIN_IDS = [6714200331];
export const OPERATOR_ID = 777000; // служебный id для ops-команд из консоли
export const appLink = (param = '') => `https://t.me/${BOT_USERNAME}?startapp=${encodeURIComponent(param || 'play')}`;
