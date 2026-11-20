// Открытие контейнера: 3D-коробка дрожит → разворачивается торцом с дверями к экрану →
// двери распахиваются, изнутри бьёт свет цвета редкости → выезжает машина.
// Чем реже машина, тем зрелищнее: легендарная — затемнение, долгая дрожь, золотые лучи, искры, фанфары.
// Тап — пропустить. После анимации показываются children (цена, кнопки).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CarArt, RarityTag } from './components';
import { containerDoorSvg, containerSideSvg, containerTopSvg, svgUrl } from './art';
import { fx } from './sound';
import { t } from './i18n';

// мс: дрожь, разворот, открытие дверей, пауза до итога
const TIMING: Record<string, [number, number, number, number]> = {
  common: [450, 1100, 700, 500],
  rare: [700, 1150, 750, 600],
  epic: [1100, 1250, 850, 900],
  mythic: [1700, 1400, 1000, 1300],
};

export function Unboxing({ container, car, onClose, children }: { container?: any; car: any; onClose: () => void; children?: ReactNode }) {
  const r = car?.rarity ?? 'common';
  const [shake, turn, open, rest] = TIMING[r] ?? TIMING.common;
  const doors = !!container;
  // 0 — дрожит (вид 3/4), 1 — разворот к дверям, 2 — двери открываются, 3 — машина выехала, 4 — итог
  const [phase, setPhase] = useState(doors ? 0 : 3);
  const timers = useRef<number[]>([]);
  const img = useMemo(() => (doors ? {
    side: svgUrl(containerSideSvg(container)), top: svgUrl(containerTopSvg(container)),
    l: svgUrl(containerDoorSvg(container, 'l')), r: svgUrl(containerDoorSvg(container, 'r')), end: svgUrl(containerDoorSvg(container, 'both')),
  } : null), [doors, container]);
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
        {img && (
          <div className="ub-scene">
            <div className="ub-cube">
              <img className="f side" src={img.side} alt="" />
              <img className="f back" src={img.side} alt="" />
              <img className="f top" src={img.top} alt="" />
              <img className="f bottom" src={img.top} alt="" />
              <img className="f rear" src={img.end} alt="" />
              <div className="f doors">
                <div className="ub-hole" />
                <img className="ub-door l" src={img.l} alt="" />
                <img className="ub-door r" src={img.r} alt="" />
                <div className="ub-seam" />
              </div>
            </div>
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
      {phase < 4 && <div className="ub-skip">{t('нажми, чтобы пропустить')}</div>}
    </div>
  );
}
