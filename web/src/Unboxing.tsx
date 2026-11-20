// Открытие контейнера: контейнер дрожит → разворачивается дверями к экрану → двери распахиваются,
// изнутри бьёт свет цвета редкости → выезжает машина. Чем реже машина, тем зрелищнее:
// легендарная — затемнение, долгая дрожь, золотые лучи, искры, вспышка, фанфары.
// Тап — пропустить. После анимации показываются children (цена, кнопки).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CarArt, ContainerArt, RarityTag } from './components';
import { containerDoorSvg, svgUrl } from './art';
import { fx } from './sound';
import { t } from './i18n';

// мс: дрожь, разворот, открытие дверей, пауза до итога
const TIMING: Record<string, [number, number, number, number]> = {
  common: [350, 600, 650, 500],
  rare: [600, 650, 700, 600],
  epic: [1000, 700, 800, 900],
  mythic: [1600, 800, 950, 1300],
};

export function Unboxing({ container, car, onClose, children }: { container?: any; car: any; onClose: () => void; children?: ReactNode }) {
  const r = car?.rarity ?? 'common';
  const [shake, turn, open, rest] = TIMING[r] ?? TIMING.common;
  const doors = !!container;
  // 0 — дрожит боком, 1 — разворот, 2 — двери открываются, 3 — машина выехала, 4 — итог
  const [phase, setPhase] = useState(doors ? 0 : 3);
  const timers = useRef<number[]>([]);
  const doorL = useMemo(() => (doors ? svgUrl(containerDoorSvg(container, 'l')) : ''), [doors, container]);
  const doorR = useMemo(() => (doors ? svgUrl(containerDoorSvg(container, 'r')) : ''), [doors, container]);
  useEffect(() => {
    const at = (ms: number, f: () => void) => timers.current.push(window.setTimeout(f, ms));
    if (doors) {
      fx.rumble(r);
      at(shake, () => setPhase(1));
      at(shake + turn, () => { setPhase(2); fx.doors(); });
      at(shake + turn + open * 0.6, () => { setPhase(3); fx.reveal(r); });
      at(shake + turn + open + rest, () => setPhase(4));
    } else {
      at(50, () => fx.reveal(r));
      at(rest + 600, () => setPhase(4));
    }
    return () => { timers.current.forEach(clearTimeout); timers.current = []; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const skip = () => { if (phase < 4) { timers.current.forEach(clearTimeout); setPhase(4); } };

  return (
    <div className={`unbox r-${r} ph-${phase}${doors ? '' : ' nodoors'}`} style={{ ['--turn' as any]: `${turn}ms`, ['--open' as any]: `${open}ms`, ['--shake' as any]: `${shake}ms` }} onClick={skip}>
      <div className="ub-dim" />
      {(r === 'epic' || r === 'mythic') && <div className="ub-rays" />}
      {r === 'mythic' && <div className="ub-sparks">{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ ['--a' as any]: `${(i * 360) / 18}deg`, ['--d' as any]: `${(i % 6) * 0.12}s` }} />)}</div>}
      <div className="ub-stage">
        <div className="ub-light" />
        <div className="ub-car"><CarArt car={car} height={180} studio /></div>
        {doors && (
          <>
            <div className="ub-side"><ContainerArt c={container} size={130} /></div>
            <div className="ub-front">
              <div className="ub-inside" />
              <img className="ub-door l" src={doorL} alt="" />
              <img className="ub-door r" src={doorR} alt="" />
              <div className="ub-seam" />
            </div>
          </>
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
      {phase < 4 && <div className="ub-skip">{t('нажми, чтобы пропустить')}</div>}
    </div>
  );
}
