import { PHOTOS } from './photos';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { call } from './tg';
import { RARITY, money, who, carNo } from './format';
import { t } from './i18n';
import { carSvg, containerSvg, svgUrl } from './art.js';

// ---------- картинки из админки (с кэшем по версиям) ----------
let versions: Record<string, number> | null = null;
let versionsAt = 0;
const cache = new Map<string, { v: number; src: string }>();
const waiting = new Map<string, ((s: string | null) => void)[]>();
let batchTimer: number | null = null;

try {
  const saved = JSON.parse(localStorage.getItem('img-cache') || '{}');
  for (const [k, v] of Object.entries(saved)) cache.set(k, v as any);
} catch { /* без кэша */ }
function persist() {
  try { localStorage.setItem('img-cache', JSON.stringify(Object.fromEntries(cache))); } catch { /* переполнен */ }
}

async function loadVersions() {
  if (versions && Date.now() - versionsAt < 60_000) return versions;
  const r = await call('app_img', {});
  versions = r.versions; versionsAt = Date.now();
  return versions!;
}
export function dropImageVersions() { versions = null; }

function request(key: string): Promise<string | null> {
  return new Promise((resolve) => {
    waiting.set(key, [...(waiting.get(key) ?? []), resolve]);
    if (batchTimer) return;
    batchTimer = window.setTimeout(async () => {
      batchTimer = null;
      const keys = [...waiting.keys()];
      const cbs = new Map(waiting); waiting.clear();
      try {
        const v = await loadVersions();
        const need = keys.filter((k) => v[k] && cache.get(k)?.v !== v[k]);
        for (let i = 0; i < need.length; i += 20) {
          const r = await call('app_img', { action: 'get', keys: need.slice(i, i + 20) });
          for (const [k, img] of Object.entries<any>(r.images)) cache.set(k, img);
        }
        if (need.length) persist();
        for (const k of keys) for (const cb of cbs.get(k) ?? []) cb(v[k] ? cache.get(k)?.src ?? null : null);
      } catch { for (const k of keys) for (const cb of cbs.get(k) ?? []) cb(null); }
    }, 30);
  });
}

export function useImage(key: string | null) {
  const [src, setSrc] = useState<string | null>(key ? cache.get(key)?.src ?? null : null);
  useEffect(() => {
    let alive = true;
    if (key) request(key).then((s) => alive && setSrc(s));
    return () => { alive = false; };
  }, [key]);
  return src;
}

// ---------- рисунки машин и контейнеров (свои, без чужих фото) ----------
const svgCache = new Map<string, string>();
function art(key: string, make: () => string) {
  let u = svgCache.get(key);
  if (!u) { u = svgUrl(make()); svgCache.set(key, u); }
  return u;
}

export function CarArt({ car, height = 90, studio = false }: { car: any; height?: number; studio?: boolean }) {
  const photo = useImage(car?.id ? `car:${car.id}` : null);
  if (photo) return <div className="car-photo" style={{ height, backgroundImage: `url(${photo})` }} />;
  // игровая графика по фото (готовая картинка со студийным фоном)
  if (car?.id && PHOTOS[car.id]) return <img className="car-pic" style={{ height }} alt="" loading="lazy" src={`art/car-${car.id}.jpg?v=${PHOTOS[car.id]}`} />;
  const key = `c${car?.id}:${car?.body}:${car?.color}:${car?.rarity}:${studio}`;
  return <img className="car-art" style={{ height }} alt="" src={art(key, () => carSvg(car, { studio }))} />;
}

export function ContainerArt({ c, size = 72, studio = false }: { c: any; size?: number; studio?: boolean }) {
  const photo = useImage(c?.id ? `container:${c.id}` : null);
  if (photo) return <div className="ct-photo" style={{ width: size * 1.6, height: size, backgroundImage: `url(${photo})` }} />;
  return <img className="ct-art" style={{ width: size * 1.76, height: size }} alt="" src={art(`k${c?.id}:${c?.emoji}:${studio}`, () => containerSvg(c, { studio }))} />;
}

export function RarityTag({ r }: { r: string }) {
  const x = RARITY[r] ?? RARITY.common;
  return <span className={`rtag r-${r}`}>{x.name}</span>;
}

export function Avatar({ u, size = 32 }: { u: any; size?: number }) {
  const [bad, setBad] = useState(false);
  const letter = (u?.first_name || u?.username || '?').slice(0, 1).toUpperCase();
  const ava = (
    <span className={`ava${u?.is_vip && !u?.profile_frame ? ' vip' : ''}`} style={{ width: size, height: size, fontSize: size * 0.42 }} title={who(u)}>
      {u?.photo_url && !bad ? <img src={u.photo_url} alt="" onError={() => setBad(true)} /> : letter}
    </span>
  );
  // рамка из магазина оформления
  return u?.profile_frame ? <span className={`fr f-${u.profile_frame}`} style={{ ['--fw' as any]: `${Math.max(2, Math.round(size * 0.07))}px` }}>{ava}</span> : ava;
}

export function Sheet({ open, onClose, children, title }: { open: boolean; onClose: () => void; children: ReactNode; title?: ReactNode }) {
  // свайп вниз закрывает шторку (когда она прокручена к началу)
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; dy: number } | null>(null);
  if (!open) return null;
  const set = (dy: number, anim = false) => { const el = ref.current; if (!el) return; el.style.transition = anim ? 'transform .22s ease' : 'none'; el.style.transform = dy ? `translateY(${dy}px)` : ''; };
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div ref={ref} className="sheet" onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => { if ((ref.current?.scrollTop ?? 0) <= 0) drag.current = { y: e.touches[0].clientY, dy: 0 }; }}
        onTouchMove={(e) => { const d = drag.current; if (!d) return; d.dy = Math.max(0, e.touches[0].clientY - d.y); if (d.dy > 0) set(d.dy); }}
        onTouchEnd={() => { const d = drag.current; drag.current = null; if (!d) return; if (d.dy > 110) onClose(); else set(0, true); }}>
        <div className="grip" />
        {title && <div className="h3">{title}</div>}
        {children}
      </div>
    </div>
  );
}

export function Toasts() {
  const [items, setItems] = useState<{ id: number; text: string }[]>([]);
  useEffect(() => {
    const on = (e: any) => {
      const id = Date.now() + Math.random();
      setItems((x) => [...x.slice(-2), { id, text: e.detail }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 2600);
    };
    window.addEventListener('toast', on);
    return () => window.removeEventListener('toast', on);
  }, []);
  return <div className="toasts">{items.map((i) => <div key={i.id} className="toast">{i.text}</div>)}</div>;
}

// Плавный счётчик денег
export function Money({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now(), a = from.current, b = value;
    if (a === b) return;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 450);
      setShown(Math.round(a + (b - a) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step); else from.current = b;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={className}>{money(shown)}</span>;
}

export function Stat({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <div className="bar"><i style={{ width: `${Math.min(100, (value / max) * 100)}%` }} /></div>
      <b>{value}</b>
    </div>
  );
}

export function CarCard({ car, onClick, ribbon }: { car: any; onClick?: () => void; ribbon?: ReactNode }) {
  return (
    <button className={`carcard press r-${car.rarity}`} onClick={onClick}>
      {ribbon && <span className="ribbon">{ribbon}</span>}
      <span className="carno">{carNo(car)}</span>
      {!!car.exclusive && <span className="excl">💎</span>}
      <CarArt car={car} height={72} />
      <div className="sb l2" style={{ fontSize: 14 }}>{car.name}</div>
      <div className="row between g6"><RarityTag r={car.rarity} /><span className="price sm">{money(car.price)}</span></div>
    </button>
  );
}

// Фон профиля из магазина оформления (кладётся первым ребёнком карточки .phead).
export function ProfileBg({ id }: { id?: string | null }) {
  return id ? <div className={`pbg bg-${id}`}><i /></div> : null;
}

// Карточка машины: картинка, редкость, номер, страна, цена и характеристики. children — кнопки под ней.
export function CarInfo({ car, priceLabel, children }: { car: any; priceLabel?: string; children?: ReactNode }) {
  return (
    <div className={`col g12 r-${car.rarity}`}>
      <div className="reveal-art"><CarArt car={car} height={170} studio /></div>
      <div className="row between g8"><RarityTag r={car.rarity} /><span className="sm muted">{carNo(car)}{car.country ? ` · ${t(car.country)}` : ''}</span></div>
      <div className="h2">{car.name}</div>
      {!!car.exclusive && <div className="excl-tag">💎 {t('Эксклюзив')}{car.edition ? ` · ${t('тираж {n} шт.', { n: car.edition })}${car.issued != null ? ` · ${t('выдано {n}', { n: car.issued })}` : ''}` : ''}</div>}
      <div className="kv"><span>{priceLabel ?? t('Стоимость по каталогу')}</span><b>{money(car.price)}</b></div>
      <Stat label={t('Скорость, км/ч') + (car.factory != null && !(car.factory & 1) ? ' ≈' : '')} value={car.max_speed} max={500} />
      <Stat label={t('Мощность, л.с.')} value={car.power} max={1800} />
      <Stat label={t('Управляемость')} value={car.handling} />
      {car.reliability != null && <Stat label={t('Надёжность')} value={car.reliability} />}
      {car.accel_x100 != null && <div className="kv"><span>{t('Разгон 0–100 км/ч')}</span><b>{car.factory != null && !(car.factory & 2) ? '≈ ' : ''}{t('{n} с', { n: (car.accel_x100 / 100).toFixed(1).replace('.', ',') })}</b></div>}
      {car.factory != null && car.factory !== 3 && <div className="xs faint">{t('≈ — производитель не публикует, значение оценено по мощности')}</div>}
      {children}
    </div>
  );
}

// Шторка с карточкой машины (каталог, награды, чужой гараж)
export function CarSheet({ car, onClose, children }: { car: any; onClose: () => void; children?: ReactNode }) {
  return <Sheet open={!!car} onClose={onClose}>{car && <CarInfo car={car}>{children}</CarInfo>}</Sheet>;
}
