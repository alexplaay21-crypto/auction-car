import { Unboxing } from '../Unboxing';
import { useCallback, useEffect, useState } from 'react';
import { CarFront, Handshake, Zap, Landmark, ParkingSquare, Check, X, Store } from 'lucide-react';
import { call, clientId, errorText, haptic, toast } from '../tg';
import { money, who, RARITY, RARITIES } from '../format';
import { CarArt, CarCard, ContainerArt, RarityTag, Sheet, Stat } from '../components';
import { AppBar, Sect, Li, Empty, Ic, FriendPicker, Kv } from '../ui';
import { useApp } from '../App';
import { CarFilterBar, applyCarFilter, F0, type CarF } from '../carfilter';
import { t } from '../i18n';

async function act(name: string, input: any, ok?: (r: any) => string) {
  try { const r = await call(name, { clientId: clientId(), ...input }); haptic('success'); if (ok) toast(ok(r)); return r; }
  catch (e) { haptic('error'); toast(errorText(e)); return null; }
}

export function Garage() {
  const { reload, setTab, push, pop } = useApp();
  const [g, setG] = useState<any>(null);
  const [f, setF] = useState<CarF>(F0);
  const [opened, setOpened] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => call('app_garage', { action: 'list' }).then(setG, (e) => toast(errorText(e))), []);
  useEffect(() => { load(); }, [load]);
  const run = async (name: string, input: any, ok?: (r: any) => string) => {
    if (busy) return null;
    setBusy(true); const r = await act(name, input, ok); setBusy(false); load(); reload(); return r;
  };
  if (!g) return <><AppBar title={t('Гараж')} back={pop} /><div className="page" /></>;
  const shown = applyCarFilter(g.cars, f);
  const fill = g.owned / g.capacity;
  return (
    <>
      <AppBar title={t('Гараж')} back={pop} />
      <div className="page">
        <div className="card">
          <div className="row"><Ic icon={ParkingSquare} tone={fill >= 0.8 ? 'red' : 'gold'} /><div className="grow"><div className="h3">{t('{a} из {b} мест', { a: g.owned, b: g.capacity })}</div><div className="sm muted">{t('Машин на {m}', { m: money(g.value) })}</div></div></div>
          <div className={`bar${fill >= 0.8 ? ' warn' : ''}`}><i style={{ width: `${Math.min(100, fill * 100)}%` }} /></div>
          {fill >= 0.8 && <div className="xs c-gold">{t('Когда гараж заполнится, новые машины будут сразу продаваться')}</div>}
          {g.next_tier && <button className="btn w" disabled={busy} onClick={() => run('app_garage', { action: 'upgrade' }, () => t('Гараж расширен'))}>{t('Расширить до {n} мест · {m}', { n: g.next_tier.total, m: money(g.next_tier.price) })}</button>}
        </div>

        {g.offers.length > 0 && (
          <>
            <Sect>{t('Предложения')}</Sect>
            <div className="card list">
              {g.offers.map((o: any) => (
                <Li key={o.id} icon={Handshake} tone="gold" title={o.car_name}
                  sub={o.buyer_id === g.me ? t('{w} продаёт за {m}', { w: who({ username: o.seller_username, first_name: o.seller_name }), m: money(o.price) }) : t('Ты предложил за {m}', { m: money(o.price) })}
                  right={o.buyer_id === g.me ? (
                    <div className="row g6">
                      <button className="btn ok s" onClick={() => run('app_garage', { action: 'answer', id: o.id, accept: true }, () => t('Машина твоя'))}><Check size={16} /></button>
                      <button className="btn bad s" onClick={() => run('app_garage', { action: 'answer', id: o.id, accept: false }, () => t('Отклонено'))}><X size={16} /></button>
                    </div>
                  ) : <button className="btn s" onClick={() => run('app_garage', { action: 'answer', id: o.id, accept: false }, () => t('Отменено'))}>{t('Отменить')}</button>} />
              ))}
            </div>
          </>
        )}

        {g.containers.length > 0 && (
          <>
            <Sect>{t('Контейнеры')}</Sect>
            <div className="card list">
              {g.containers.map((c: any) => (
                <Li key={c.id} lead={<ContainerArt c={c} size={30} />} title={t(c.name)} sub={t('{n} шт. · откроется без аукциона', { n: c.qty })}
                  right={<button className="btn go s" disabled={busy} onClick={async () => { const r = await run('app_garage', { action: 'open', id: c.id }); if (r) setOpened({ ...r, container: c }); }}>{t('Открыть')}</button>} />
              ))}
            </div>
          </>
        )}

        {g.cars.length > 0 && <CarFilterBar list={g.cars} f={f} onChange={setF} />}
        {shown.length ? <div className="grid2">{shown.map((c: any) => <CarCard key={c.user_car_id} car={c} onClick={() => push({ name: 'car', id: c.user_car_id })} />)}</div>
          : g.cars.length ? <Empty icon={CarFront} title={t('Таких машин нет')} />
          : <Empty icon={CarFront} title={t('Гараж пуст')} text={t('Выиграй контейнер на аукционе — внутри будет машина.')} action={t('К аукциону')} onAction={() => setTab('auction')} />}
      </div>

      {opened && (
        <Unboxing container={opened.container} car={opened.car} onClose={() => setOpened(null)}>
          <div className="h3">{t('Стоимость {m}', { m: money(opened.car.price) })}</div>
          {opened.auto_sold != null && <div className="sm muted">{t('Гараж полон — продана за {m}', { m: money(opened.auto_sold) })}</div>}
          <button className="btn go xl w" onClick={() => setOpened(null)}>{t('Отлично')}</button>
        </Unboxing>
      )}
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
  if (!car) return <><AppBar title={t('Машина')} back={pop} /><div className="page" /></>;
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
            <Kv k={t('Стоимость по каталогу')} v={money(car.price)} />
          </div>
        </div>
        <Sect>{t('Характеристики')}</Sect>
        <div className="card">
          <Stat label={t('Скорость, км/ч')} value={car.max_speed} max={420} />
          <Stat label={t('Мощность, л.с.')} value={car.power} max={1200} />
          <Stat label={t('Управляемость')} value={car.handling} />
          <Stat label={t('Надёжность')} value={car.reliability} />
          <Kv k={t('Разгон 0–100 км/ч')} v={t('{n} с', { n: (car.accel_x100 / 100).toFixed(1).replace('.', ',') })} />
        </div>
        {car.sale && (
          <>
            <Sect>{t('Продать')}</Sect>
            <div className="card list">
              <Li icon={car.sale.quick ? Zap : Landmark} tone={car.sale.quick ? '' : 'blue'}
                title={`${car.sale.quick ? t('Быстрая продажа') : t('Государству')} · ${money(car.sale.amount)}`}
                sub={t('Сразу, комиссия {n}%', { n: car.sale.rate / 100 }) + (car.sale.quick ? t(' · первые {n} после получения', { n: (car.sale.window ?? 900) >= 3600 ? t('{h} ч', { h: car.sale.window / 3600 }) : t('{m} мин', { m: Math.round((car.sale.window ?? 900) / 60) }) }) : '')}
                onClick={() => !busy && run('app_garage', { action: 'sell', id: car.user_car_id }, (r) => t('Продано за {m}', { m: money(r.sold.amount) }))} />
              {['epic', 'mythic', 'mystic'].includes(car.rarity) && <Li icon={Store} tone="green" title={t('Выставить на рынок')} sub={t('Свою цену увидят все игроки')} onClick={() => setMode('market')} />}
              <Li icon={Handshake} tone="gold" title={t('Продать игроку')} sub={t('Предложение придёт ему в бот')} onClick={() => setMode('player')} />
            </div>
          </>
        )}
      </div>

      <Sheet open={!!mode} onClose={() => setMode(null)} title={mode === 'market' ? t('Выставить на рынок') : t('Продать игроку')}>
        {mode === 'player' && (
          <>
            <FriendPicker value={to} onPick={setTo} />
            <input className="inp" placeholder={t('@username или ID')} value={to} onChange={(e) => setTo(e.target.value)} />
          </>
        )}
        <input className="inp big" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} />
        <div className="chips">{[0.8, 1, 1.2, 1.5].map((k) => <button key={k} className="chip" onClick={() => setPrice(String(Math.round(car.price * k)))}>{k === 1 ? t('по каталогу') : `${k > 1 ? '+' : '−'}${Math.round(Math.abs(k - 1) * 100)}%`}</button>)}</div>
        <div className="sm muted">{t('Комиссия {n}% — получишь {m}', { n: me.fees.player / 100, m: money(net) })}{mode === 'player' ? t(' · предложение действует 15 минут') : ''}</div>
        {mode === 'market'
          ? <button className="btn go xl w" disabled={busy || !price} onClick={() => run('app_market', { action: 'sell', userCarId: car.user_car_id, price: Number(price) }, () => t('Машина выставлена на рынок'))}>{t('Выставить за {m}', { m: money(Number(price) || 0) })}</button>
          : <button className="btn go xl w" disabled={busy || !to || !price} onClick={() => run('app_garage', { action: 'offer', id: car.user_car_id, to, price: Number(price) }, () => t('Предложение отправлено'))}>{t('Предложить за {m}', { m: money(Number(price) || 0) })}</button>}
      </Sheet>
    </>
  );
}
