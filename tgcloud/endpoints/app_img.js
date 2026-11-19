// Картинки машин и контейнеров, загруженные в админке. Mini App просит список
// версий, потом — только те картинки, которых нет у него в кэше.
import { endpoint } from '../lib/endpoint.js';

export default endpoint(async (db, uid, input) => {
  if (input.action === 'get') {
    const want = (Array.isArray(input.keys) ? input.keys : []).slice(0, 20)
      .map((k) => /^(car|container|lot):(\d+)$/.exec(String(k))).filter(Boolean);
    const out = {};
    for (const [, kind, id] of want) {
      const r = await db.get('SELECT mime, data, v FROM images WHERE kind = :k AND ref_id = :i', { ':k': kind, ':i': Number(id) });
      if (r) out[`${kind}:${id}`] = { v: r.v, src: `data:${r.mime};base64,${r.data}` };
    }
    return { images: out };
  }
  const rows = await db.all('SELECT kind, ref_id, v FROM images');
  return { versions: Object.fromEntries(rows.map((r) => [`${r.kind}:${r.ref_id}`, r.v])) };
});
