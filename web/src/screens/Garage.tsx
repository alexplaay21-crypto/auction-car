import { useCallback, useEffect, useState } from 'react';
import { CarFront, Handshake, Zap, Landmark, ParkingSquare, Check, X, Store } from 'lucide-react';
import { call, clientId, errorText, haptic, toast } from '../tg';
import { money, who, RARITY, RARITIES } from '../format';
import { CarArt, CarCard, ContainerArt, RarityTag, Sheet, Stat } from '../components';
import { AppBar, Sect, Li, Empty, Ic, FriendPicker, Kv } from '../ui';
import { useApp } from '../App';

async function act(name: string, input: any, ok?: (r: any) => string) {
  try { const r = await call(name, { clientId: clientId(), ...input }); haptic('success'); if (ok) toast(ok(r)); return r; }
  catch (e) { haptic('error'); toast(errorText(e)); return null; }
}

export function Garage() {
  const { reload, setTab, push, pop } = useApp();
  const [g, setG] = useState<any>(null);
  const [rarity, setRarity] = useState<string | null>(null);
  const [opened, setOpened] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => call('app_garage', { action: 'list', rarity }).then(setG, (e) => toast(errorText(e))), [rarity]);
  useEffect(() => { load(); }, [load]);
  const run = async (name: string, input: any, ok?: (r: any) => string) => {
    if (busy) return null;
    setBusy(true); const r = await act(name, input, ok); setBusy(false); load(); reload(); return r;
  };
  if (!g) return <><AppBar title="Гараж" back={pop} /><div className="page" /></>;
  const fill = g.owned / g.capacity;
  return (
    <>
      <AppBar title="Гараж" back={pop} />
      <div className="page">
        <div className="card">
          <div className="row"><Ic icon={ParkingSquare} tone={fill >= 0.8 ? 'red' : 'gold'} /><div className="grow"><div className="h3">{g.owned} из {g.capacity} мест</div><div className="sm muted">Машин на {money(g.value)}</div></div></div>
          <div className={`bar${fill >= 0.8 ? ' warn' : ''}`}><i style={{ width: `${Math.min(100, fill * 100)}%` }} /></div>
          {fill >= 0.8 && <div className="xs c-gold">Когда гараж заполнится, новые машины будут сразу продаваться</div>}
          {g.next_tier && <button className="btn w" disabled={busy} onClick={() => run('app_garage', { action: 'upgrade' }, () => 'Гараж расширен')}>Расширить до {g.next_tier.total} мест · {money(g.next_tier.price)}</button>}
        </div>

        {g.offers.length > 0 && (
          <>
            <Sect>Предложения</Sect>
            <div className="card list">
              {g.offers.map((o: any) => (
                <Li key={o.id} icon={Handshake} tone="gold" title={o.car_name}
                  sub={o.buyer_id === g.me ? `${who({ username: o.seller_username, first_name: o.seller_name })} продаёт за ${money(o.price)}` : `Ты предложил за ${money(o.price)}`}
                  right={o.buyer_id === g.me ? (
                    <div className="row g6">
                      <button className="btn ok s" onClick={() => run('app_garage', { action: 'answer', id: o.id, accept: true }, () => 'Машина твоя')}><Check size={16} /></button>
                      <button className="btn bad s" onClick={() => run('app_garage', { action: 'answer', id: o.id, accept: false }, () => 'Отклонено')}><X size={16} /></button>
                    </div>
                  ) : <button className="btn s" onClick={() => run('app_garage', { action: 'answer', id: o.id, accept: false }, () => 'Отменено')}>Отменить</button>} />
              ))}
            </div>
          </>
        )}

        {g.containers.length > 0 && (
          <>
            <Sect>Контейнеры</Sect>
            <div className="card list">
              {g.containers.map((c: any) => (
                <Li key={c.id} lead={<ContainerArt c={c} size={30} />} title={c.name} sub={`${c.qty} шт. · откроется без аукциона`}
                  right={<button className="btn go s" disabled={busy} onClick={async () => { const r = await run('app_garage', { action: 'open', id: c.id }); if (r) setOpened(r); }}>Открыть</button>} />
              ))}
            </div>
          </>
        )}

        <div className="chips">
          <button className={`chip${!rarity ? ' on' : ''}`} onClick={() => setRarity(null)}>Все</button>
          {RARITIES.map((r) => <button key={r} className={`chip${rarity === r ? ' on' : ''}`} onClick={() => setRarity(r)}>{RARITY[r].name}</button>)}
        </div>
        {g.cars.length ? <div className="grid2">{g.cars.map((c: any) => <CarCard key={c.user_car_id} car={c} onClick={() => push({ name: 'car', id: c.user_car_id })} />)}</div>
          : rarity ? <Empty icon={CarFront} title="Таких машин нет" />
          : <Empty icon={CarFront} title="Гараж пуст" text="Выиграй контейнер на аукционе — внутри будет машина." action="К аукциону" onAction={() => setTab('auction')} />}
      </div>

      <Sheet open={!!opened} onClose={() => setOpened(null)}>
        {opened && (
          <div className={`reveal r-${opened.car.rarity}`}>
            <div className="sm muted">Контейнер открыт</div>
            <div className="reveal-art"><CarArt car={opened.car} height={170} studio /></div>
            <div className="h2">{opened.car.name}</div><RarityTag r={opened.car.rarity} />
            <div className="h3">Стоимость {money(opened.car.price)}</div>
            {opened.auto_sold != null && <div className="sm muted">Гараж полон — продана за {money(opened.auto_sold)}</div>}
            <button className="btn go xl w" onClick={() => setOpened(null)}>Отлично</button>
          </div>
        )}
      </Sheet>
    </>
  );
}

export function CarPage({ id }: { id: number }) {
  const { me, pop, reload } = useApp();
  const [car, setCar] = useState<any>(null);
  const [mode, setMode] = useState<null | 'player' | 'market'>(null);
  const [to, setTo] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { call('app_garage', { action: 'car', id }).then((c) => { setCar(c); setPrice(String(c.price)); }, (e) => { toast(errorText(e)); pop(); }); }, [id, pop]);
  const run = async (name: string, input: any, ok: (r: any) => string) => {
    setBusy(true); const r = await act(name, input, ok); setBusy(false);
    if (r) { reload(); pop(); }
  };
  if (!car) return <><AppBar title="Машина" back={pop} /><div className="page" /></>;
  const net = Math.floor((Number(price) || 0) * (1 - me.fees.player / 10000));
  return (
    <>
      <AppBar title={car.name} back={pop} />
      <div className={`page r-${car.rarity}`}>
        <div className="card pad0">
          <div className="hero-img"><CarArt car={car} height={180} studio /></div>
          <div className="col g8" style={{ padding: 14 }}>
            <div className="row between"><RarityTag r={car.rarity} /><span className="sm muted">{car.country}</span></div>
            <div className="h2">{car.name}</div>
            <Kv k="Стоимость по каталогу" v={money(car.price)} />
          </div>
        </div>
        <Sect>Характеристики</Sect>
        <div className="card">
          <Stat label="Скорость, км/ч" value={car.max_speed} max={420} />
          <Stat label="Мощность, л.с." value={car.power} max={1200} />
          <Stat label="Управляемость" value={car.handling} />
          <Stat label="Надёжность" value={car.reliability} />
          <Kv k="Разгон 0–100 км/ч" v={`${(car.accel_x100 / 100).toFixed(1).replace('.', ',')} с`} />
        </div>
        {car.sale && (
          <>
            <Sect>Продать</Sect>
            <div className="card list">
              <Li icon={car.sale.quick ? Zap : Landmark} tone={car.sale.quick ? '' : 'blue'}
                title={`${car.sale.quick ? 'Быстрая продажа' : 'Государству'} · ${money(car.sale.amount)}`}
                sub={`Сразу, комиссия ${car.sale.rate / 100}%${car.sale.quick ? ' · первые 15 минут после получения' : ''}`}
                onClick={() => !busy && run('app_garage', { action: 'sell', id: car.user_car_id }, (r) => `Продано за ${money(r.sold.amount)}`)} />
              <Li icon={Store} tone="green" title="Выставить на рынок" sub="Свою цену увидят все игроки" onClick={() => setMode('market')} />
              <Li icon={Handshake} tone="gold" title="Продать игроку" sub="Предложение придёт ему в бот" onClick={() => setMode('player')} />
            </div>
          </>
        )}
      </div>

      <Sheet open={!!mode} onClose={() => setMode(null)} title={mode === 'market' ? 'Выставить на рынок' : 'Продать игроку'}>
        {mode === 'player' && (
          <>
            <FriendPicker value={to} onPick={setTo} />
            <input className="inp" placeholder="@username или ID" value={to} onChange={(e) => setTo(e.target.value)} />
          </>
        )}
        <input className="inp big" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} />
        <div className="chips">{[0.8, 1, 1.2, 1.5].map((k) => <button key={k} className="chip" onClick={() => setPrice(String(Math.round(car.price * k)))}>{k === 1 ? 'по каталогу' : `${k > 1 ? '+' : '−'}${Math.round(Math.abs(k - 1) * 100)}%`}</button>)}</div>
        <div className="sm muted">Комиссия {me.fees.player / 100}% — получишь {money(net)}{mode === 'player' ? ' · предложение действует 15 минут' : ''}</div>
        {mode === 'market'
          ? <button className="btn go xl w" disabled={busy || !price} onClick={() => run('app_market', { action: 'sell', userCarId: car.user_car_id, price: Number(price) }, () => 'Машина выставлена на рынок')}>Выставить за {money(Number(price) || 0)}</button>
          : <button className="btn go xl w" disabled={busy || !to || !price} onClick={() => run('app_garage', { action: 'offer', id: car.user_car_id, to, price: Number(price) }, () => 'Предложение отправлено')}>Предложить за {money(Number(price) || 0)}</button>}
      </Sheet>
    </>
  );
}
