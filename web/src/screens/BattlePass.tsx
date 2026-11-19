import { useCallback, useEffect, useState } from 'react';
import { Trophy, Lock, Check, Crown } from 'lucide-react';
import { call, errorText, haptic, toast } from '../tg';
import { money, RARITY } from '../format';
import { CarArt, RarityTag, Sheet } from '../components';
import { AppBar, Ic, Kv, Sect, Empty } from '../ui';
import { left } from '../format';
import { useApp } from '../App';
import { t } from '../i18n';
import { useStarsBuy } from './Shop';

const CAR_R: Record<number, string> = { 1: 'rare', 2: 'epic', 3: 'mythic' };
function rewardText(r: any) {
  if (r.kind === 'money') return money(r.value);
  if (r.kind === 'container') return `${r.container?.emoji ?? '📦'} ${r.container?.name ? t(r.container.name) : t('Контейнер')}`;
  if (r.kind === 'skill') return t('Навык +{n}', { n: r.value });
  if (r.kind === 'car') return t('{r} машина', { r: RARITY[CAR_R[r.value]]?.name });
  return '—';
}

export function BattlePass() {
  const { pop, reload } = useApp();
  const [bp, setBp] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [got, setGot] = useState<any>(null);
  const load = useCallback(() => call('app_bp', {}).then(setBp, (e) => toast(errorText(e))), []);
  const stars = useStarsBuy(() => { load(); reload(); });
  useEffect(() => { load(); }, [load]);
  const claim = async (level: number, track: string) => {
    if (busy) return;
    setBusy(true);
    try { const r = await call('app_bp', { action: 'claim', level, track }); setBp(r.bp); haptic('success'); if (r.reward.car) setGot(r.reward.car); else toast(t('Награда получена')); reload(); }
    catch (e) { haptic('error'); toast(errorText(e)); }
    setBusy(false);
  };
  if (!bp) return <><AppBar title="Battle Pass" back={pop} /><div className="page" /></>;
  if (!bp.season) return <><AppBar title="Battle Pass" back={pop} /><div className="page"><Empty icon={Trophy} title={t('Сезон не идёт')} text={t('Новый сезон скоро начнётся — следи за новостями.')} /></div></>;
  const inLevel = bp.xp % bp.per_level;
  const ready = bp.levels.filter((l: any) => l.unlocked && (!l.free.claimed || (bp.premium && !l.premium.claimed))).length;
  return (
    <>
      <AppBar title={bp.name ?? 'Battle Pass'} back={pop} />
      <div className="page">
        <div className="card" style={{ borderColor: 'rgba(180,107,255,.45)', background: 'linear-gradient(160deg, rgba(180,107,255,.18), var(--card) 60%)' }}>
          <div className="row"><Ic icon={Trophy} tone="gold" size={46} /><div className="grow"><div className="sm muted">{t('Уровень')}</div><div className="skill-big">{bp.level}<span className="h3 muted"> / {bp.levels.length}</span></div></div>
            {ready > 0 && <span className="rtag r-mythic">{t('наград: {n}', { n: ready })}</span>}</div>
          <div className="bar"><i style={{ width: `${bp.level >= bp.levels.length ? 100 : (inLevel / bp.per_level) * 100}%` }} /></div>
          <div className="sm muted">{bp.level >= bp.levels.length ? t('Все уровни пройдены!') : t('{a} / {b} опыта до уровня {c}', { a: inLevel, b: bp.per_level, c: bp.level + 1 })}</div>
          <div className="xs muted">{t('До конца сезона: {t}', { t: left(bp.left_s) })}</div>
          {!bp.premium && (
            <>
              {bp.stars && <button className="btn go xl w" disabled={stars.busy} onClick={() => stars.buy('bp')}><Crown size={18} /> {t('Открыть премиум за ⭐ {n}', { n: bp.stars })}</button>}
              <button className="btn ghost w" disabled={busy} onClick={async () => { setBusy(true); try { setBp(await call('app_bp', { action: 'buy' })); haptic('success'); toast(t('Премиум открыт')); reload(); } catch (e) { toast(errorText(e)); } setBusy(false); }}>
                {t('или за {m} игровых', { m: money(bp.price) })}
              </button>
            </>
          )}
        </div>

        <Sect>{t('Как получить опыт')}</Sect>
        <div className="card">{bp.xp_rules.map(([k, v]: any) => <Kv key={k} k={t(k)} v={`+${v}`} c="var(--orange)" />)}</div>

        <Sect>{t('Награды')}</Sect>
        <div className="bp-row xs muted b"><span /> <span>{t('Бесплатно')}</span><span className="c-gold">{t('Премиум')}</span></div>
        <div className="col g8">
          {bp.levels.map((l: any) => (
            <div key={l.level} className="bp-row">
              <div className={`bp-lvl${l.unlocked ? ' on' : ''}`}>{l.level}</div>
              <Cell r={l.free} unlocked={l.unlocked} canClaim={l.unlocked && !l.free.claimed} onClaim={() => claim(l.level, 'free')} />
              <Cell r={l.premium} prem unlocked={l.unlocked && bp.premium} canClaim={l.unlocked && bp.premium && !l.premium.claimed} onClaim={() => claim(l.level, 'premium')} />
            </div>
          ))}
        </div>
      </div>
      <Sheet open={!!got} onClose={() => setGot(null)}>
        {got && (
          <div className={`reveal r-${got.rarity}`}>
            <div className="sm muted">{t('Награда Battle Pass')}</div>
            <div className="reveal-art"><CarArt car={got} height={170} studio /></div>
            <div className="h2">{got.name}</div><RarityTag r={got.rarity} />
            <div className="h3">{t('Стоимость {m}', { m: money(got.price) })}</div>
            <button className="btn go xl w" onClick={() => setGot(null)}>{t('В гараж')}</button>
          </div>
        )}
      </Sheet>
    </>
  );
}

function Cell({ r, prem, unlocked, canClaim, onClaim }: { r: any; prem?: boolean; unlocked: boolean; canClaim: boolean; onClaim: () => void }) {
  return (
    <button className={`bp-cell press${prem ? ' prem' : ''}${!unlocked ? ' locked' : ''}${r.claimed ? ' done' : ''}`} onClick={canClaim ? onClaim : undefined} style={canClaim ? { borderColor: 'var(--orange)' } : undefined}>
      <span className={`sm sb${r.kind === 'car' ? ` r-${CAR_R[r.value]}` : ''}`} style={r.kind === 'car' ? { color: 'var(--rc)' } : undefined}>{rewardText(r)}</span>
      <span className="xs muted row g6">{r.claimed ? <><Check size={12} /> {t('получено')}</> : canClaim ? <span className="c-orange b">{t('Забрать')}</span> : <><Lock size={12} /> {prem && !unlocked ? t('премиум') : t('закрыто')}</>}</span>
    </button>
  );
}
