// Поиск через страницу MediaSearch (кэшируемая HTML-страница, без лимита API).
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { GERMAN } from '/home/user/auction-car/tgcloud/lib/catalog_de.js';
const UA = { 'User-Agent': 'CarAuctionGame/1.0 (asset research; low volume)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FILE = new URL('./cands2.json', import.meta.url);
const out = existsSync(FILE) ? JSON.parse(readFileSync(FILE)) : {};
const BAD = /(interior|innen|engine|motor|dashboard|cockpit|detail|wheel|felge|badge|logo|emblem|rear|heck|back|hinten|station|stationsge|cabrio|convertible|race|rally|crash|unfall|wreck|tuning|model|modell|toy|lego|museum_hall|parade|street_view|blick)/i;
const GOOD = /(side|seite|lateral|profile|profil|left|right|links|rechts)/i;
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
  for (const term of [`${c[1]} side view`, c[1]]) {
    for (const f of await search(term)) if (!all.includes(f) && /\.(jpe?g|png)$/i.test(f) && !BAD.test(f)) all.push(f);
    if (all.filter((f) => GOOD.test(f)).length >= 4) break;
  }
  all.sort((a, b) => (GOOD.test(b) ? 1 : 0) - (GOOD.test(a) ? 1 : 0));
  out[i] = all.slice(0, 6).map((f) => ({ file: f, thumb: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(f)}?width=1280`, page: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(f)}` }));
  writeFileSync(FILE, JSON.stringify(out, null, 1));
  console.log(i, c[1], out[i].length, out[i][0]?.file ?? '-');
}
console.log('done');
