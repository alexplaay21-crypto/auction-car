import { useCallback, useEffect, useState } from 'react';
import { Store, Tag, X } from 'lucide-react';
import { call, errorText, haptic, toast } from '../tg';
import { money, RARITY, RARITIES } from '../format';
import { CarArt, CarCard, RarityTag, Sheet, Stat } from '../components';
import { AppBar, Sect, Seg, Nick, CarPicker, Empty, Kv } from '../ui';
import { useApp } from '../App';

export function Market() {
  const { me, reload } = useApp();
  const [d, setD] = useState<any>(null);
  const [rarity, setRarity] = useState<string | null>(null);
  const [sort, setSort] = useState<'new' | 'cheap' | 'deal' | 'expensive'>('new');
  const [mine, setMine] = useState(false);
  const [open, setOpen] = useState<any>(null);
  const [sell, setSell] = useState(false);
  const [car, setCar] = useState<any>(null);
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => call('app_market', { rarity, sort, mine }).then(setD, (e) => toast(errorText(e))), [rarity, sort, mine]);
  useEffect(() => { load(); }, [load]);
  const run = async (input: any, ok: string) => {
    if (busy) return false;
    setBusy(true);
    try { await call('app_market', input); haptic('success'); toast(ok); reload(); load(); setBusy(false); return true; }
    catch (e) { haptic('error'); toast(errorText(e)); setBusy(false); return false; }
  };

  return (
    <>
      <AppBar title="Рынок" />
      <div className="page">
        <button className="btn go xl w" onClick={() => { setCar(null); setPrice(''); setSell(true); }}><Tag size={18} /> Продать свою машину</button>
        <Seg value={sort} onChange={setSort} options={[['new', 'Новые'], ['deal', 'Выгодные'], ['cheap', 'Дешевле'], ['expensive', 'Дороже']]} />
        <div className="chips">
          <button className={`chip${!rarity && !mine ? ' on' : ''}`} onClick={() => { setRarity(null); setMine(false); }}>Все</button>
          {RARITIES.map((r) => <button key={r} className={`chip${rarity === r ? ' on' : ''}`} onClick={() => setRarity(rarity === r ? null : r)}>{RARITY[r].name}</button>)}
          <button className={`chip${mine ? ' on' : ''}`} onClick={() => setMine(!mine)}>Мои лоты</button>
        </div>
        {d && (d.list.length ? (
          <div className="grid2">
            {d.list.map((l: any) => {
              const pct = Math.round(((l.ask - l.price) / l.price) * 100);
              return <CarCard key={l.listing_id} car={{ ...l, price: l.ask }} onClick={() => setOpen(l)} ribbon={pct <= -10 ? `−${Math.abs(pct)}%` : undefined} />;
            })}
          </div>
        ) : <Empty icon={Store} title={mine ? 'У тебя нет лотов' : 'Пока никто ничего не продаёт'} text="Выставь свою машину — её увидят все игроки." />)}

        {d?.sold?.length > 0 && (
          <>
            <Sect>Последние сделки</Sect>
            <div className="card list">{d.sold.map((s: any, i: number) => <Kv key={i} k={<span className={`r-${s.rarity}`}><span className="rtag" style={{ marginRight: 8 }}>{RARITY[s.rarity]?.name}</span>{s.name}</span>} v={money(s.price)} />)}</div>
          </>
        )}
      </div>

      <Sheet open={!!open} onClose={() => setOpen(null)}>
        {open && (
          <div className={`col g12 r-${open.rarity}`}>
            <div className="reveal-art"><CarArt car={open} height={170} studio /></div>
            <div className="row between"><div className="h2 ell">{open.name}</div><RarityTag r={open.rarity} /></div>
            <div className="row g6 sm muted">Продаёт <Nick u={open.seller} /></div>
            <Kv k="Цена" v={money(open.ask)} c="var(--orange)" />
            <Kv k="Стоимость по каталогу" v={money(open.price)} />
            <Stat label="Скорость" value={open.max_speed} max={420} />
            <Stat label="Мощность" value={open.power} max={1200} />
            <Stat label="Управляемость" value={open.handling} />
            {open.seller_id === me.user.id
              ? <button className="btn bad xl w" disabled={busy} onClick={async () => { if (await run({ action: 'unlist', listingId: open.listing_id }, 'Лот снят')) setOpen(null); }}><X size={18} /> Снять с продажи</button>
              : <button className="btn go xl w" disabled={busy} onClick={async () => { if (await run({ action: 'buy', listingId: open.listing_id }, 'Машина твоя')) setOpen(null); }}>Купить за {money(open.ask)}</button>}
            <div className="xs faint center">Баланс {money(me.balance)}. Продавец получит цену минус комиссию рынка.</div>
          </div>
        )}
      </Sheet>

      <Sheet open={sell} onClose={() => setSell(false)} title="Выставить на рынок">
        <CarPicker value={car?.user_car_id ?? null} onPick={(c) => { setCar(c); setPrice(String(c.price)); }} />
        {car && (
          <>
            <input className="inp big" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} />
            <div className="chips">{[0.8, 1, 1.2, 1.5].map((k) => <button key={k} className="chip" onClick={() => setPrice(String(Math.round(car.price * k)))}>{k === 1 ? 'по каталогу' : `${k > 1 ? '+' : '−'}${Math.round(Math.abs(k - 1) * 100)}%`}</button>)}</div>
            <div className="sm muted">Комиссия рынка {me.fees.player / 100}% — получишь {money(Math.floor((Number(price) || 0) * (1 - me.fees.player / 10000)))}</div>
            <button className="btn go xl w" disabled={busy || !price} onClick={async () => { if (await run({ action: 'sell', userCarId: car.user_car_id, price: Number(price) }, 'Машина выставлена')) setSell(false); }}>Выставить за {money(Number(price) || 0)}</button>
          </>
        )}
      </Sheet>
    </>
  );
}
