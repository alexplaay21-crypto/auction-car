// carfilter.tsx — единые фильтры и сортировка списков машин (каталог контейнера, гараж, рынок):
// редкость (в т.ч. «только мистические»), марка, страна, цена, мощность; сортировка по цене, редкости, мощности.
import { useMemo, useState, type ReactNode } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { RARITY, RARITIES, RARITY_RANK } from './format';
import { Sheet } from './components';
import { t } from './i18n';

// марки из двух слов (названия в игре изменены — см. catalog_world.js)
const TWO = ['Alpha Romio', 'Aston Martyn', 'Land Rovar', 'Range Rovar', 'Grate Wall', 'Li Avto', 'Rols-Rois', 'Alfa Romeo', 'Aston Martin', 'Land Rover', 'Range Rover', 'Great Wall'];
export const brandOf = (name: string) => TWO.find((b) => name.startsWith(b + ' ')) ?? String(name ?? '').split(' ')[0];

export type CarSort = 'cheap' | 'expensive' | 'rarity' | 'power';
export type CarF = { rarity: string | null; brand: string | null; country: string | null; price: number | null; power: number | null; sort: CarSort | string };
export const F0: CarF = { rarity: null, brand: null, country: null, price: null, power: null, sort: 'expensive' };

const PRICE: [number, string, number, number][] = [
  [1, 'до $25K', 0, 25_000], [2, '$25–100K', 25_000, 100_000], [3, '$100K–1M', 100_000, 1_000_000], [4, 'больше $1M', 1_000_000, Infinity],
];
const POWER: [number, string, number, number][] = [
  [1, 'до 150 л.с.', 0, 150], [2, '150–300', 150, 300], [3, '300–600', 300, 600], [4, '600+ л.с.', 600, Infinity],
];
const SORTS: [CarSort, string][] = [['rarity', 'Редкость'], ['cheap', 'Дешевле'], ['expensive', 'Дороже'], ['power', 'Мощность']];

// price — поле цены (на рынке это цена лота)
export function applyCarFilter<T extends Record<string, any>>(list: T[], f: CarF, price = 'price'): T[] {
  const pr = PRICE.find((x) => x[0] === f.price), pw = POWER.find((x) => x[0] === f.power);
  const out = list.filter((c) => (!f.rarity || c.rarity === f.rarity) && (!f.brand || brandOf(c.name) === f.brand) && (!f.country || c.country === f.country)
    && (!pr || (c[price] >= pr[2] && c[price] < pr[3])) && (!pw || (c.power >= pw[2] && c.power < pw[3])));
  const by: Record<string, (a: T, b: T) => number> = {
    cheap: (a, b) => a[price] - b[price],
    expensive: (a, b) => b[price] - a[price],
    rarity: (a, b) => (RARITY_RANK[b.rarity] ?? 0) - (RARITY_RANK[a.rarity] ?? 0) || b[price] - a[price],
    power: (a, b) => (b.power ?? 0) - (a.power ?? 0),
  };
  return by[f.sort] ? [...out].sort(by[f.sort]) : out;
}

// extraSorts — сортировки, которые делает сервер (на рынке «Новые», «Выгодные»), ставятся первыми
// compact — всё (редкость, сортировка и extra) внутри шторки, снаружи одна кнопка «Фильтры»
export function CarFilterBar({ list, f, onChange, rarities = RARITIES, extraSorts = [], compact = false, extra, extraCount = 0, onReset }:
  { onReset?: () => void; list: any[]; f: CarF; onChange: (f: CarF) => void; rarities?: string[]; extraSorts?: [string, string][]; compact?: boolean; extra?: ReactNode; extraCount?: number }) {
  const [open, setOpen] = useState(false);
  const brands = useMemo(() => [...new Set((list ?? []).map((c) => brandOf(c.name)))].sort(), [list]);
  const countries = useMemo(() => [...new Set((list ?? []).map((c) => c.country).filter(Boolean))].sort(), [list]);
  const n = [f.brand, f.country, f.price, f.power].filter((x) => x != null).length;
  const set = (p: Partial<CarF>) => onChange({ ...f, ...p });
  const sorts = [...extraSorts, ...SORTS];
  const rarityChips = (
    <div className={compact ? 'row wrap g6' : 'chips'}>
      <button className={`chip${!f.rarity ? ' on' : ''}`} onClick={() => set({ rarity: null })}>{t('Все')}</button>
      {rarities.map((r) => (
        <button key={r} className={`chip${f.rarity === r ? ' on' : ''}${r === 'mystic' ? ' chip-mystic' : ''}`} onClick={() => set({ rarity: f.rarity === r ? null : r })}>
          {r === 'mystic' ? `${RARITY.mystic.icon} ${t('Только мистические')}` : RARITY[r].name}
        </button>
      ))}
    </div>
  );
  const sortChips = (cls: string) => sorts.map(([k, l]) => <button key={k} className={`chip${f.sort === k ? ' on' : ''}`} onClick={() => set({ sort: k })}>{t(l)}</button>);
  const total = n + (f.rarity ? 1 : 0) + extraCount;
  const details = (
    <>
          {brands.length > 1 && (
            <label className="col g6"><span className="sm muted">{t('Марка')}</span>
              <select className="field" value={f.brand ?? ''} onChange={(e) => set({ brand: e.target.value || null })}>
                <option value="">{t('Все марки')}</option>{brands.map((b) => <option key={b} value={b}>{b}</option>)}
              </select></label>
          )}
          {countries.length > 1 && (
            <label className="col g6"><span className="sm muted">{t('Страна')}</span>
              <select className="field" value={f.country ?? ''} onChange={(e) => set({ country: e.target.value || null })}>
                <option value="">{t('Все страны')}</option>{countries.map((c) => <option key={c} value={c}>{t(c)}</option>)}
              </select></label>
          )}
          <div className="col g6"><span className="sm muted">{t('Цена')}</span>
            <div className="row wrap g6">{PRICE.map(([k, l]) => <button key={k} className={`chip${f.price === k ? ' on' : ''}`} onClick={() => set({ price: f.price === k ? null : k })}>{t(l)}</button>)}</div></div>
          <div className="col g6"><span className="sm muted">{t('Мощность')}</span>
            <div className="row wrap g6">{POWER.map(([k, l]) => <button key={k} className={`chip${f.power === k ? ' on' : ''}`} onClick={() => set({ power: f.power === k ? null : k })}>{t(l)}</button>)}</div></div>
          <div className="row g8">
            <button className="btn ghost grow" onClick={() => { onChange({ ...F0, sort: f.sort }); onReset?.(); }}>{t('Сбросить')}</button>
            <button className="btn go grow" onClick={() => setOpen(false)}>{t('Показать')}</button>
          </div>
    </>
  );
  if (compact) return (
    <>
      <button className={`btn w filter-btn${total ? ' on' : ''}`} onClick={() => setOpen(true)}>
        <SlidersHorizontal size={16} /> {t('Фильтры')}{total ? ` · ${total}` : ''}
        <span className="sm muted">· {t(sorts.find(([k]) => k === f.sort)?.[1] ?? '')}</span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('Фильтры')}>
        <div className="col g12">
          {extra}
          <div className="col g6"><span className="sm muted">{t('Сортировка')}</span><div className="row wrap g6">{sortChips('')}</div></div>
          <div className="col g6"><span className="sm muted">{t('Редкость')}</span>{rarityChips}</div>
          {details}
        </div>
      </Sheet>
    </>
  );
  return (
    <>
      {rarityChips}
      <div className="chips">
        <button className={`chip${n ? ' on' : ''}`} onClick={() => setOpen(true)}><SlidersHorizontal size={15} /> {t('Фильтры')}{n ? ` · ${n}` : ''}</button>
        {sortChips('')}
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('Фильтры')}>
        <div className="col g12">
          {details}
        </div>
      </Sheet>
    </>
  );
}

