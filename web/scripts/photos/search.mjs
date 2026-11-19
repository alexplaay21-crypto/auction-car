// Поиск через страницу MediaSearch (кэшируемая HTML-страница, без лимита API).
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import crypto from 'node:crypto';
import { GERMAN } from '/home/user/auction-car/tgcloud/lib/catalog_de.js';
const UA = { 'User-Agent': 'CarAuctionGame/1.0 (asset research; low volume)' };
const th = (f, w) => { const n = f.replace(/ /g, '_'); const h = crypto.createHash('md5').update(n).digest('hex'); const e = encodeURIComponent(n); return `https://thumb.wikimedia.org/wikipedia/commons/thumb/${h[0]}/${h.slice(0, 2)}/${e}/${w}px-${e}`; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FILE = new URL('./cands.json', import.meta.url);
const out = existsSync(FILE) ? JSON.parse(readFileSync(FILE)) : {};
const BAD = /(19[0-9]{2}|200[0-9])|(interior|innen|engine|motor|dashboard|cockpit|detail|wheel|felge|badge|logo|emblem|rear|heck|back|hinten|station|stationsge|cabrio|convertible|race|rally|crash|unfall|wreck|tuning|model|modell|toy|lego|museum_hall|parade|street_view|blick)/i;
const GOOD = /(front|IAA|salon|motor_show|auto_show|genf|geneva|frankfurt|munich|m%C3%BCnchen|vorne)/i;
async function search(term) {
  const u = 'https://commons.wikimedia.org/w/index.php?' + new URLSearchParams({ search: term, title: 'Special:MediaSearch', type: 'image' });
  for (let t = 0; t < 6; t++) {
    const r = await fetch(u, { headers: UA }).catch(() => null);
    if (r?.ok) { const h = await r.text(); await sleep(2500); return [...new Set(h.match(/\/wiki\/File:[^"&?#]+/g) ?? [])].map((x) => decodeURIComponent(x.slice(11))); }
    await sleep(((Number(r?.headers.get('retry-after')) || 10) + t * 5) * 1000);
  }
  return [];
}
for (const [i, c] of GERMAN.entries()) {
  if (out[i]?.length >= 4) continue;
  const all = [];
  for (const term of [`${c[1]} front IAA`, `${c[1]} front`, c[1]]) {
    for (const f of await search(term)) if (!all.includes(f) && /\.(jpe?g|png)$/i.test(f) && !BAD.test(f)) all.push(f);
    if (all.filter((f) => GOOD.test(f)).length >= 6) break;
  }
  all.sort((a, b) => (GOOD.test(b) ? 1 : 0) - (GOOD.test(a) ? 1 : 0));
  out[i] = all.slice(0, 6).map((f) => ({ file: f, thumb: th(f, 1280), small: th(f, 330), page: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(f)}` }));
  writeFileSync(FILE, JSON.stringify(out, null, 1));
  console.log(i, c[1], out[i].length, out[i][0]?.file ?? '-');
}
console.log('done');
