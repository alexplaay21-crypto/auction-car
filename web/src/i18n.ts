// i18n.ts — языки интерфейса. Исходные строки — русские; t('…', {n}) подставляет перевод
// для выбранного языка и значения вместо {имя}. Словари — в en.ts.
import { EN } from './en';

export type Lang = 'ru' | 'en';
let lang: Lang = 'ru';
try { const saved = localStorage.getItem('lang'); if (saved === 'en' || saved === 'ru') lang = saved; } catch { /* нет хранилища */ }

export function setLang(l: Lang) { lang = l; try { localStorage.setItem('lang', l); } catch { /* нет хранилища */ } document.documentElement.lang = l; }
export const getLang = () => lang;

export function t(ru: string, vars?: Record<string, string | number>): string {
  let s = lang === 'en' ? EN[ru] ?? ru : ru;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
