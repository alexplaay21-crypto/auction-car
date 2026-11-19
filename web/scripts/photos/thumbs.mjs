// Маленькие превью кандидатов (330px) для листов выбора — медленно, по одному.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
const d = JSON.parse(readFileSync(new URL('./cands.json', import.meta.url)));
const UA = { 'User-Agent': 'CarAuctionGame/1.0 (asset research; low volume)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync('th', { recursive: true });
const only = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
for (const [car, list] of Object.entries(d)) {
  if (only && !only.has(car)) continue;
  for (const [j, c] of list.entries()) {
    const f = `th/${car}-${j}.jpg`;
    if (existsSync(f) || !c.thumb) continue;
    const u = c.small;
    for (let t = 0; t < 8; t++) {
      const r = await fetch(u, { headers: UA }).catch(() => null);
      if (r?.ok) { writeFileSync(f, Buffer.from(await r.arrayBuffer())); await sleep(700); break; }
      const ra = Number(r?.headers.get('retry-after')) || 10;
      await sleep((ra + 2 + t * 4) * 1000);
    }
  }
}
console.log('thumbs ok');
