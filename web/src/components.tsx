import { useEffect, useRef, useState, type ReactNode } from 'react';
import { call } from './tg';
import { RARITY, money, who } from './format';

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

// ---------- силуэт машины (если фото не загружено) ----------
const BODIES: Record<string, string> = {
  sedan: 'M8 44 L14 34 Q18 30 26 29 L44 20 Q50 17 60 17 L86 17 Q96 17 104 24 L114 30 Q126 31 132 34 Q138 37 138 44 L138 50 L8 50 Z',
  hatch: 'M8 44 L12 34 Q16 30 24 29 L42 18 Q48 15 58 15 L94 15 Q104 15 110 24 L120 34 Q132 35 136 40 L138 50 L8 50 Z',
  coupe: 'M6 46 L12 37 Q16 33 26 31 L50 21 Q58 18 70 18 L84 18 Q96 19 106 27 L118 33 Q132 34 138 40 L140 50 L6 50 Z',
  super: 'M4 46 L10 40 Q16 36 30 34 L58 23 Q66 21 78 21 L88 22 Q98 24 110 31 L126 35 Q138 37 142 42 L142 50 L4 50 Z',
  wagon: 'M8 44 L14 34 Q18 30 26 29 L42 18 Q46 16 56 16 L120 16 Q126 16 128 22 L132 32 Q138 35 138 42 L138 50 L8 50 Z',
  suv: 'M8 44 L10 30 Q12 26 20 25 L36 13 Q40 11 50 11 L112 11 Q120 11 124 18 L130 28 Q138 30 138 38 L138 50 L8 50 Z',
};

export function CarArt({ car, height = 90 }: { car: any; height?: number }) {
  const photo = useImage(car?.id ? `car:${car.id}` : null);
  const r = RARITY[car?.rarity] ?? RARITY.common;
  if (photo) return <div className="car-photo" style={{ height, backgroundImage: `url(${photo})` }} />;
  const color = car?.color || r.color;
  return (
    <svg className="car-art" viewBox="0 0 146 64" style={{ height }} aria-hidden>
      <defs>
        <linearGradient id={`g${car?.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="1" />
          <stop offset="1" stopColor={color} stopOpacity="0.72" />
        </linearGradient>
      </defs>
      <ellipse cx="73" cy="56" rx="64" ry="4" fill="rgba(0,0,0,.25)" />
      <path d={BODIES[car?.body] ?? BODIES.sedan} fill={`url(#g${car?.id})`} stroke="rgba(0,0,0,.35)" strokeWidth="1" />
      <path d="M48 21 L60 19 L84 19 Q94 19 101 26 L104 29 L44 29 Z" fill="rgba(180,220,255,.55)" />
      <circle cx="36" cy="50" r="9" fill="#15171c" /><circle cx="36" cy="50" r="4" fill="#9aa0a8" />
      <circle cx="112" cy="50" r="9" fill="#15171c" /><circle cx="112" cy="50" r="4" fill="#9aa0a8" />
      <rect x="130" y="36" width="7" height="3" rx="1.5" fill="#ffe7a3" />
    </svg>
  );
}

export function ContainerArt({ c, size = 72 }: { c: any; size?: number }) {
  const photo = useImage(c?.id ? `container:${c.id}` : null);
  if (photo) return <div className="ct-photo" style={{ width: size * 1.5, height: size, backgroundImage: `url(${photo})` }} />;
  return (
    <div className="ct-art" style={{ width: size * 1.5, height: size }}>
      <div className="ct-ribs" />
      <span className="ct-flag">{c?.emoji ?? '📦'}</span>
    </div>
  );
}

export function RarityTag({ r }: { r: string }) {
  const x = RARITY[r] ?? RARITY.common;
  return <span className={`rtag r-${r}`}>{x.name}</span>;
}

export function Avatar({ u, size = 32 }: { u: any; size?: number }) {
  const [bad, setBad] = useState(false);
  const letter = (u?.first_name || u?.username || '?').slice(0, 1).toUpperCase();
  return (
    <span className={`ava${u?.is_vip ? ' vip' : ''}`} style={{ width: size, height: size, fontSize: size * 0.42 }} title={who(u)}>
      {u?.photo_url && !bad ? <img src={u.photo_url} alt="" onError={() => setBad(true)} /> : letter}
    </span>
  );
}

export function Sheet({ open, onClose, children, title }: { open: boolean; onClose: () => void; children: ReactNode; title?: ReactNode }) {
  if (!open) return null;
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        {title && <div className="sheet-title">{title}</div>}
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
    <div className="statbar">
      <span>{label}</span>
      <div className="bar"><i style={{ width: `${Math.min(100, (value / max) * 100)}%` }} /></div>
      <b>{value}</b>
    </div>
  );
}

export function CarCard({ car, onClick, badge }: { car: any; onClick?: () => void; badge?: ReactNode }) {
  return (
    <button className={`carcard r-${car.rarity}`} onClick={onClick}>
      <CarArt car={car} height={64} />
      <div className="carcard-name">{car.name}</div>
      <div className="carcard-foot"><RarityTag r={car.rarity} /><b>{money(car.price)}</b></div>
      {badge}
    </button>
  );
}
