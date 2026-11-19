import { writeFileSync } from 'node:fs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const Q = JSON.parse(process.argv[2]);
const out = {};
for (const [k, terms] of Object.entries(Q)) {
  const seen = new Map();
  for (const q of terms) {
    const p = new URLSearchParams({ type: 'models', downloadable: 'true', q, count: '12' }); p.append('licenses', 'by'); p.append('licenses', 'cc0');
    const r = await fetch('https://api.sketchfab.com/v3/search?' + p); const j = r.ok ? await r.json() : { results: [] };
    for (const m of j.results ?? []) if (!seen.has(m.uid) && (m.faceCount ?? 0) < 2_500_000) seen.set(m.uid, { uid: m.uid, name: m.name, license: m.license?.label, author: m.user?.displayName || m.user?.username, page: m.viewerUrl, faces: m.faceCount, likes: m.likeCount });
    await sleep(600);
  }
  out[k] = [...seen.values()];
  console.log(k, '|', out[k].slice(0, 7).map((x, i) => `${i}:${x.name.slice(0, 32)}(${x.likes},${Math.round(x.faces / 1000)}k)`).join(' ; '));
}
writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
