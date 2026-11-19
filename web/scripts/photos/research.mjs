import { writeFileSync, readFileSync } from 'node:fs';
import crypto from 'node:crypto';
const UA = { 'User-Agent': 'CarAuctionGame/1.0 (asset research; low volume)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const d = JSON.parse(readFileSync('cands.json'));
const terms = JSON.parse(process.argv[2]); // { idx: [term, ...] }
const th = (f, w) => { const n = f.replace(/ /g, '_'); const h = crypto.createHash('md5').update(n).digest('hex'); const e = encodeURIComponent(n); return `https://thumb.wikimedia.org/wikipedia/commons/thumb/${h[0]}/${h.slice(0, 2)}/${e}/${w}px-${e}`; };
for (const [k, list] of Object.entries(terms)) {
  const files = [];
  for (const term of list) {
    const u = 'https://commons.wikimedia.org/w/index.php?' + new URLSearchParams({ search: term, title: 'Special:MediaSearch', type: 'image' });
    const r = await fetch(u, { headers: UA }); const h = await r.text(); await sleep(2500);
    for (const f of [...new Set(h.match(/\/wiki\/File:[^"&?#]+/g) ?? [])].map((x) => decodeURIComponent(x.slice(11)))) if (/\.(jpe?g)$/i.test(f) && !files.includes(f)) files.push(f);
  }
  d[k] = files.slice(0, 6).map((f) => ({ file: f, thumb: th(f, 1280), small: th(f, 330), page: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(f)}` }));
  console.log(k, d[k].map((x) => x.file).join(' | '));
}
writeFileSync('cands.json', JSON.stringify(d, null, 1));
