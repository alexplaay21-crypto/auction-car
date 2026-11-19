// Скачать выбранные модели (GLB) и записать сведения об авторах.
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const c = JSON.parse(readFileSync('cands.json')), c2 = JSON.parse(readFileSync('cands2.json')), c3 = JSON.parse(readFileSync('cands3.json'));
const picks = JSON.parse(readFileSync('picks.json'));
const only = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
mkdirSync('models', { recursive: true });
const meta = existsSync('meta.json') ? JSON.parse(readFileSync('meta.json')) : {};
for (const [k, [src, i]] of Object.entries(picks)) {
  if (only && !only.has(k)) continue;
  const [base, key] = src.split('_'); const pool = { c, c2, c3 }[base]; const list = pool[key ?? k];
  const m = list?.[i]; if (!m) { console.log('нет', k); continue; }
  const f = `models/${m.uid}.glb`;
  if (!existsSync(f) || statSync(f).size < 1000) {
    let d = {};
    for (let t = 0; t < 30; t++) {
      const r = await fetch(`https://api.sketchfab.com/v3/models/${m.uid}/download`);
      if (r.status === 429) { const ra = Number(r.headers.get('retry-after')) || 120; console.log('wait', ra); await new Promise((z) => setTimeout(z, (ra + 5) * 1000)); continue; }
      d = await r.json(); break;
    }
    await new Promise((z) => setTimeout(z, 15000));
    const g = d.glb ?? d.gltf; if (!g) { console.log('нет glb', k, JSON.stringify(d).slice(0, 120)); continue; }
    if (g.size > 150e6) { console.log('слишком большая', k, g.size); continue; }
    execFileSync('curl', ['-sS', '--max-time', '300', '-o', d.glb ? f : f + '.zip', g.url]);
    if (!d.glb) { console.log('только gltf zip', k); continue; }
  }
  meta[k] = { uid: m.uid, name: m.name, author: m.author, license: m.license, page: m.page, file: f };
  writeFileSync('meta.json', JSON.stringify(meta, null, 1));
  console.log(k, m.name.slice(0, 40), Math.round(statSync(f).size / 1e6) + 'MB');
}
