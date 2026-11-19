// cosmetics.js — фоны и рамки профиля: каталог, покупка за игровые деньги, надеть / снять.
import { NOW } from './sql.js';
import { GameError, getUser, toGameError } from './engine.js';

async function exec(db, q, p) { try { return await db.run(q, p); } catch (e) { throw toGameError(e) ?? e; } }

export async function cosmeticsView(db, uid) {
  const u = await getUser(db, uid);
  const list = await db.all(`SELECT c.*, (uc.user_id IS NOT NULL) AS owned FROM cosmetics c
    LEFT JOIN user_cosmetics uc ON uc.cosmetic_id = c.id AND uc.user_id = :u WHERE c.is_active = 1 OR uc.user_id IS NOT NULL ORDER BY c.kind, c.sort`, { ':u': uid });
  return {
    balance: u.balance, bg: u.profile_bg ?? null, frame: u.profile_frame ?? null,
    items: list.map((c) => ({ ...c, owned: !!c.owned, equipped: c.id === u.profile_bg || c.id === u.profile_frame })),
  };
}

export async function buyCosmetic(db, uid, id) {
  const c = await db.get('SELECT * FROM cosmetics WHERE id = :i', { ':i': String(id ?? '') });
  if (!c) throw new GameError('ITEM_UNAVAILABLE');
  if (await db.get('SELECT 1 AS x FROM user_cosmetics WHERE user_id = :u AND cosmetic_id = :i', { ':u': uid, ':i': c.id })) throw new GameError('ALREADY_OWNED');
  await exec(db, `INSERT INTO user_cosmetics (user_id, cosmetic_id, price, created_at) VALUES (:u, :i, :p, ${NOW})`, { ':u': uid, ':i': c.id, ':p': c.price });
  return cosmeticsView(db, uid);
}

// id = null снимает фон или рамку (kind).
export async function equipCosmetic(db, uid, id, kind) {
  const c = id ? await db.get('SELECT * FROM cosmetics WHERE id = :i', { ':i': String(id) }) : null;
  const k = c?.kind ?? (kind === 'frame' ? 'frame' : 'bg');
  await exec(db, `UPDATE users SET ${k === 'bg' ? 'profile_bg' : 'profile_frame'} = :i WHERE id = :u`, { ':i': c?.id ?? null, ':u': uid });
  return cosmeticsView(db, uid);
}
