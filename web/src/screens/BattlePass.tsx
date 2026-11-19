import { useCallback, useEffect, useState } from 'react';
import { Trophy, Lock, Check, Crown } from 'lucide-react';
import { call, errorText, haptic, toast } from '../tg';
import { money, RARITY } from '../format';
import { CarArt, RarityTag, Sheet } from '../components';
import { AppBar, Ic, Kv, Sect } from '../ui';
import { useApp } from '../App';

const CAR_R: Record<number, string> = { 1: 'rare', 2: 'epic', 3: 'mythic' };
function rewardText(r: any) {
  if (r.kind === 'money') return money(r.value);
  if (r.kind === 'container') return `${r.container?.emoji ?? '📦'} ${r.container?.name ?? 'Контейнер'}`;
  if (r.kind === 'skill') return `Навык +${r.value}`;
  if (r.kind === 'car') return `${RARITY[CAR_R[r.value]]?.name} машина`;
  return '—';
}

export function BattlePass() {
  const { pop, reload } = useApp();
  const [bp, setBp] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [got, setGot] = useState<any>(null);
  const load = useCallback(() => call('app_bp', {}).then(setBp, (e) => toast(errorText(e))), []);
  useEffect(() => { load(); }, [load]);
  const claim = async (level: number, track: string) => {
    if (busy) return;
    setBusy(true);
    try { const r = await call('app_bp', { action: 'claim', level, track }); setBp(r.bp); haptic('success'); if (r.reward.car) setGot(r.reward.car); else toast('Награда получена'); reload(); }
    catch (e) { haptic('error'); toast(errorText(e)); }
    setBusy(false);
  };
  if (!bp) return <><AppBar title="Battle Pass" back={pop} /><div className="page" /></>;
  const inLevel = bp.xp % bp.per_level;
  const ready = bp.levels.filter((l: any) => l.unlocked && (!l.free.claimed || (bp.premium && !l.premium.claimed))).length;
  return (
    <>
      <AppBar title={`Battle Pass · сезон ${bp.season}`} back={pop} />
      <div className="page">
        <div className="card" style={{ borderColor: 'rgba(180,107,255,.45)', background: 'linear-gradient(160deg, rgba(180,107,255,.18), var(--card) 60%)' }}>
          <div className="row"><Ic icon={Trophy} tone="gold" size={46} /><div className="grow"><div className="sm muted">Уровень</div><div className="skill-big">{bp.level}<span className="h3 muted"> / {bp.levels.length}</span></div></div>
            {ready > 0 && <span className="rtag r-mythic">наград: {ready}</span>}</div>
          <div className="bar"><i style={{ width: `${bp.level >= bp.levels.length ? 100 : (inLevel / bp.per_level) * 100}%` }} /></div>
          <div className="sm muted">{bp.level >= bp.levels.length ? 'Все уровни пройдены!' : `${inLevel} / ${bp.per_level} опыта до уровня ${bp.level + 1}`}</div>
          {!bp.premium && (
            <button className="btn go xl w" disabled={busy} onClick={async () => { setBusy(true); try { setBp(await call('app_bp', { action: 'buy' })); haptic('success'); toast('Премиум открыт'); reload(); } catch (e) { toast(errorText(e)); } setBusy(false); }}>
              <Crown size={18} /> Открыть премиум · {money(bp.price)}
            </button>
          )}
        </div>

        <Sect>Как получить опыт</Sect>
        <div className="card">{bp.xp_rules.map(([k, v]: any) => <Kv key={k} k={k} v={`+${v}`} c="var(--orange)" />)}</div>

        <Sect>Награды</Sect>
        <div className="bp-row xs muted b"><span /> <span>Бесплатно</span><span className="c-gold">Премиум</span></div>
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
            <div className="sm muted">Награда Battle Pass</div>
            <div className="reveal-art"><CarArt car={got} height={170} studio /></div>
            <div className="h2">{got.name}</div><RarityTag r={got.rarity} />
            <div className="h3">Стоимость {money(got.price)}</div>
            <button className="btn go xl w" onClick={() => setGot(null)}>В гараж</button>
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
      <span className="xs muted row g6">{r.claimed ? <><Check size={12} /> получено</> : canClaim ? <span className="c-orange b">Забрать</span> : <><Lock size={12} /> {prem && !unlocked ? 'премиум' : 'закрыто'}</>}</span>
    </button>
  );
}
