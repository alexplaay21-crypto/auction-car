// Поиск 3D-моделей на Sketchfab: только скачиваемые, CC BY / CC0, разумный размер.
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { GERMAN } from '/home/user/auction-car/tgcloud/lib/catalog_de.js';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FILE = new URL('./cands.json', import.meta.url).pathname;
const out = existsSync(FILE) ? JSON.parse(readFileSync(FILE)) : {};
const LIC = ['322a749bcfa841b29dff1e8a1bb74b0b', '7c23a1ba438d4306920229c12afcb5f9']; // CC BY, CC0
const BAD = /(low ?poly|lowpoly|wheel|rim|interior|engine|toy|lego|cartoon|crash|wreck|police|taxi|rally|drift|livery|body kit|chassis|tire|seat|steering)/i;
mkdirSync('th', { recursive: true });
async function search(q) {
  const p = new URLSearchParams({ type: 'models', downloadable: 'true', q, count: '24', sort_by: '-likeCount' }); p.append('licenses', 'by'); p.append('licenses', 'cc0');
  const u = 'https://api.sketchfab.com/v3/search?' + p;
  for (let t = 0; t < 5; t++) { const r = await fetch(u); if (r.ok) return (await r.json()).results ?? []; await sleep(3000 * (t + 1)); }
  return [];
}
const only = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
for (const [i, c] of GERMAN.entries()) {
  if (only ? !only.has(String(i)) : out[i]) continue;
  const extra = process.argv[3] ? JSON.parse(process.argv[3])[i] : null;
  const terms = extra ?? [c[1].replace(/\b(Mk|Type )\s?(\d)/, 'Mk$2'), c[1].split(' ').slice(0, 3).join(' ')];
  const seen = new Map();
  for (const q of terms) for (const r of await search(q)) {
    if (seen.has(r.uid) || BAD.test(r.name) || (r.faceCount ?? 0) > 2_500_000) continue;
    seen.set(r.uid, { uid: r.uid, name: r.name, license: r.license?.label, author: r.user?.displayName || r.user?.username, page: r.viewerUrl,
      faces: r.faceCount, likes: r.likeCount, thumb: (r.thumbnails?.images ?? []).filter((x) => x.width <= 640).sort((a, b) => b.width - a.width)[0]?.url });
  }
  out[i] = [...seen.values()].slice(0, 8);
  writeFileSync(FILE, JSON.stringify(out, null, 1));
  console.log(i, c[1], out[i].length);
  await sleep(800);
}
console.log('done');
