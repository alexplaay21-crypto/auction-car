// Открытие контейнера: двери распахиваются, изнутри бьёт свет цвета редкости, выезжает машина.
// Чем реже машина, тем зрелищнее: легендарная — затемнение, дрожь, золотые лучи, искры, вспышка.
// Тап — пропустить анимацию. После неё показываются children (название, цена, кнопки).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CarArt, ContainerArt, RarityTag } from './components';
import { fx } from './sound';
import { t } from './i18n';

const TIMING: Record<string, { shake: number; open: number; total: number }> = {
  common: { shake: 350, open: 700, total: 1500 },
  rare: { shake: 550, open: 800, total: 1900 },
  epic: { shake: 900, open: 900, total: 2500 },
  mythic: { shake: 1500, open: 1000, total: 3600 },
};

export function Unboxing({ container, car, onClose, children }: { container?: any; car: any; onClose: () => void; children?: ReactNode }) {
  const r = car?.rarity ?? 'common';
  const T = TIMING[r] ?? TIMING.common;
  const doors = !!container;
  // 0 — контейнер (дрожит), 1 — двери открываются, 2 — машина выехала, 3 — итог
  const [phase, setPhase] = useState(doors ? 0 : 1);
  const timers = useRef<number[]>([]);
  useEffect(() => {
    const at = (ms: number, f: () => void) => timers.current.push(window.setTimeout(f, ms));
    const s = doors ? T.shake : 0;
    if (doors) { fx.rumble(r); }
    at(s, () => { setPhase(1); if (doors) fx.doors(); });
    at(s + (doors ? T.open * 0.55 : 150), () => { setPhase(2); fx.reveal(r); });
    at(s + (doors ? T.open : 0) + T.total - T.shake - T.open + 400, () => setPhase(3));
    return () => { timers.current.forEach(clearTimeout); timers.current = []; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const skip = () => { if (phase < 3) { timers.current.forEach(clearTimeout); setPhase(3); } };

  return (
    <div className={`unbox r-${r} ph-${phase}${doors ? '' : ' nodoors'}`} style={{ ['--shake' as any]: `${T.shake}ms`, ['--open' as any]: `${T.open}ms` }} onClick={skip}>
      <div className="ub-dim" />
      {(r === 'epic' || r === 'mythic') && <div className="ub-rays" />}
      {r === 'mythic' && <div className="ub-sparks">{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ ['--a' as any]: `${(i * 360) / 18}deg`, ['--d' as any]: `${(i % 6) * 0.12}s` }} />)}</div>}
      <div className="ub-stage">
        <div className="ub-light" />
        <div className="ub-car"><CarArt car={car} height={180} studio /></div>
        {doors && (
          <div className="ub-box">
            <div className="ub-inside" />
            <div className="ub-door l"><div className="ub-face"><ContainerArt c={container} size={120} /></div></div>
            <div className="ub-door r"><div className="ub-face"><ContainerArt c={container} size={120} /></div></div>
          </div>
        )}
      </div>
      {r === 'mythic' && <div className="ub-stamp">{t('ЛЕГЕНДАРНАЯ!')}</div>}
      {r === 'epic' && <div className="ub-stamp epic">{t('ЭПИЧЕСКАЯ!')}</div>}
      <div className="ub-flash" />
      <div className="ub-info" onClick={(e) => e.stopPropagation()}>
        <div className="h2">{car?.name}</div>
        <RarityTag r={r} />
        {children}
        <button className="btn ghost w" onClick={onClose}>{t('Закрыть')}</button>
      </div>
      {phase < 3 && <div className="ub-skip">{t('нажми, чтобы пропустить')}</div>}
    </div>
  );
}
