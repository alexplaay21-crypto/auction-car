// lib/rich.js — сборка Rich Messages (Bot API 10.1+) из блоков InputRichBlock.
// Используются только документированные типы блоков и RichText — без HTML-строк,
// поэтому не нужно экранирование. Отправка с запасным вариантом: если sendRichMessage
// вернул ошибку, уходит обычный sendMessage с parse_mode HTML (без имитации блоков).

// ---------- RichText ----------
export const b = (text) => ({ type: 'bold', text });
export const i = (text) => ({ type: 'italic', text });
export const code = (text) => ({ type: 'code', text });
export const mark = (text) => ({ type: 'marked', text });
export const link = (text, url) => ({ type: 'url', text, url });
export const math = (expression) => ({ type: 'mathematical_expression', expression });

// ---------- блоки ----------
export const h = (text, size = 2) => ({ type: 'heading', text, size });
export const p = (text) => ({ type: 'paragraph', text });
export const hr = () => ({ type: 'divider' });
export const footer = (text) => ({ type: 'footer', text });
export const quote = (blocks, credit) => ({ type: 'blockquote', blocks, ...(credit ? { credit } : {}) });
export const details = (summary, blocks, open = false) => ({ type: 'details', summary, blocks, ...(open ? { is_open: true } : {}) });
export const mathBlock = (expression) => ({ type: 'mathematical_expression', expression });
// items — RichText (станет абзацем) или { blocks: [...] }. checks — отметки для списка-чеклиста.
export const list = (items, { checks } = {}) => ({
  type: 'list',
  items: items.map((it, n) => ({
    blocks: it && typeof it === 'object' && Array.isArray(it.blocks) ? it.blocks : [p(it)],
    ...(checks ? { has_checkbox: true, ...(checks[n] ? { is_checked: true } : {}) } : {}),
  })),
});

// rows — массив строк, каждая строка — массив RichText. Первая строка — заголовок, если header.
export function table(rows, { header = true, align = [], striped = true, compact = false } = {}) {
  return {
    type: 'table',
    cells: rows.map((r, ri) => r.map((text, ci) => ({
      text, align: align[ci] ?? 'left', valign: 'middle', ...(header && ri === 0 ? { is_header: true } : {}),
    }))),
    is_bordered: true, ...(striped ? { is_striped: true } : {}), ...(compact ? { is_compact: true } : {}),
  };
}

export const photo = (fileId, caption) => ({ type: 'photo', photo: { type: 'photo', media: fileId }, ...(caption ? { caption: { text: caption } } : {}) });

// Кнопка внутри сообщения (RichMessageButton). style: success | danger | primary | link.
export function btn(text, action, style) {
  return { text, ...action, ...(style ? { style } : {}) };
}
export const cb = (data) => ({ callback_data: data });
export const url = (u) => ({ url: u });
export const webApp = (u) => ({ web_app: { url: u } });
export const buttons = (list, align = 'center') => ({ type: 'buttons', buttons: list.slice(0, 8), align });

export const rich = (blocks) => ({ blocks });

// Простая HTML-версия для запасной отправки (только стандартные теги parse_mode HTML).
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function plain(x) {
  if (x == null) return '';
  if (typeof x === 'string') return esc(x);
  if (Array.isArray(x)) return x.map(plain).join('');
  if (x.type === 'bold') return `<b>${plain(x.text)}</b>`;
  if (x.type === 'italic') return `<i>${plain(x.text)}</i>`;
  if (x.type === 'code') return `<code>${plain(x.text)}</code>`;
  if (x.type === 'url') return `<a href="${esc(x.url)}">${plain(x.text)}</a>`;
  if (x.type === 'mathematical_expression') return `<code>${esc(x.expression)}</code>`;
  return plain(x.text);
}
export function fallbackHtml(blocks) {
  const out = [];
  for (const bl of blocks) {
    if (bl.type === 'heading') out.push(`<b>${plain(bl.text)}</b>`);
    else if (bl.type === 'paragraph' || bl.type === 'footer') out.push(plain(bl.text));
    else if (bl.type === 'divider') out.push('—————');
    else if (bl.type === 'list') out.push(bl.items.map((it) => '• ' + fallbackHtml(it.blocks)).join('\n'));
    else if (bl.type === 'table') out.push(bl.cells.map((r) => r.map((c) => plain(c.text)).join(' · ')).join('\n'));
    else if (bl.type === 'details') out.push(`<b>${plain(bl.summary)}</b>\n${fallbackHtml(bl.blocks)}`);
    else if (bl.type === 'blockquote') out.push(`<blockquote>${fallbackHtml(bl.blocks)}</blockquote>`);
    else if (bl.type === 'mathematical_expression') out.push(`<code>${esc(bl.expression)}</code>`);
  }
  return out.filter(Boolean).join('\n\n').slice(0, 4000);
}
// Кнопки rich-сообщения → обычная inline-клавиатура для запасной отправки.
export function fallbackKeyboard(blocks) {
  const rows = blocks.filter((x) => x.type === 'buttons').map((r) => r.buttons.map((x) => ({ text: plain(x.text).replace(/<[^>]+>/g, ''), ...(x.callback_data ? { callback_data: x.callback_data } : x.url ? { url: x.url } : x.web_app ? { web_app: x.web_app } : {}) })));
  return rows.length ? { inline_keyboard: rows } : undefined;
}

// Отправить rich message; при ошибке — обычное HTML-сообщение.
export async function sendRich(api, params, blocks) {
  try {
    return await api.sendRichMessage({ ...params, rich_message: rich(blocks) });
  } catch (e) {
    console.warn('sendRichMessage failed, fallback to HTML:', e?.description ?? String(e));
    if (params.ephemeral_message_parameters) throw e;
    const { rich_message, ...rest } = params;
    void rich_message;
    return api.sendMessage({ ...rest, text: fallbackHtml(blocks), parse_mode: 'HTML', reply_markup: fallbackKeyboard(blocks) });
  }
}
