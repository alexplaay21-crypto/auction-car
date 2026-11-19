// Сборка: выбранное фото → игровая картинка web/public/art/car-<id>.jpg + манифесты и авторы.
// picks.json: { "<номер в GERMAN>": { "c": номер кандидата, "flip": true, "spots": [[x, y, r], ...] } }
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { GERMAN } from '/home/user/auction-car/tgcloud/lib/catalog_de.js';
import { germanIds } from '/home/user/auction-car/tgcloud/lib/ddl8.js';
const here = (p) => new URL(p, import.meta.url).pathname;
const d = JSON.parse(readFileSync(here('cands.json')));
const picks = JSON.parse(readFileSync(here('picks.json')));
const UA = { 'User-Agent': 'CarAuctionGame/1.0 (asset research; low volume)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ids = germanIds();
const ART = '/home/user/auction-car/web/public/art';
mkdirSync(here('raw'), { recursive: true });
const only = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
const manFile = here('manifest.json');
const man = existsSync(manFile) ? JSON.parse(readFileSync(manFile)) : {};
for (const [k, p] of Object.entries(picks)) {
  if (only && !only.has(k)) continue;
  const c = d[k]?.[p.c];
  if (!c) { console.log('нет кандидата', k); continue; }
  const raw = here(`raw/${k}-${p.c}.jpg`);
  if (!existsSync(raw)) {
    for (let t = 0; t < 8; t++) {
      const r = await fetch(c.thumb, { headers: UA }).catch(() => null);
      if (r?.ok) { writeFileSync(raw, Buffer.from(await r.arrayBuffer())); await sleep(800); break; }
      await sleep(((Number(r?.headers.get('retry-after')) || 10) + 2 + t * 4) * 1000);
    }
  }
  // автор и лицензия — со страницы файла
  if (!c.license) {
    const r = await fetch(c.page, { headers: UA }).catch(() => null);
    const h = r?.ok ? await r.text() : '';
    const strip = (x) => x.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/\s+/g, ' ').trim();
    c.license = strip(h.match(/class="licensetpl_short"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? '') || 'CC BY-SA';
    c.author = strip(h.match(/id="fileinfotpl_aut"[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/)?.[1] ?? '').slice(0, 120);
    await sleep(1500);
  }
  const id = ids[Number(k)];
  const out = `${ART}/car-${id}.jpg`;
  const args = [here('stylize.py'), raw, GERMAN[k][2], out, p.flip ? 'flip' : 'noflip', JSON.stringify(p.spots ?? []), JSON.stringify(p.boxes ?? []), p.auto === false ? 'noauto' : 'auto'];
  execFileSync(here('../imgenv/bin/python'), args, { stdio: 'inherit' });
  const v = createHash('md5').update(readFileSync(out)).digest('hex').slice(0, 8);
  man[k] = { id, v, car: GERMAN[k][0], author: c.author, license: c.license, page: c.page };
  console.log(k, id, GERMAN[k][0], v);
}
writeFileSync(manFile, JSON.stringify(man, null, 1));
const photos = Object.fromEntries(Object.values(man).map((m) => [m.id, m.v]));
const credits = Object.values(man).map(({ car, author, license, page }) => ({ car, author, license, page }));
writeFileSync('/home/user/auction-car/web/src/photos.ts', `// Создано сборкой фото-графики — машины с игровой графикой по фото (id → версия файла).\nexport const PHOTOS: Record<number, string> = ${JSON.stringify(photos)};\nexport const CREDITS: { car: string; author: string; license: string; page: string }[] = ${JSON.stringify(credits, null, 1)};\n`);
writeFileSync('/home/user/auction-car/tgcloud/lib/photo_manifest.js', `// Создано сборкой фото-графики — машины с игровой графикой по фото (id → версия файла).\nexport const PHOTOS = ${JSON.stringify(photos)};\n`);
console.log('built', Object.keys(man).length);
