import { useCallback, useEffect, useState } from 'react';
import { CarFront, Handshake, Zap, Landmark, ParkingSquare, Check, X } from 'lucide-react';
import { call, clientId, errorText, haptic, toast } from '../tg';
import { money, who, RARITY, RARITIES } from '../format';
import { CarArt, CarCard, ContainerArt, RarityTag, Sheet, Stat } from '../components';
import { Card, SectionTitle, ListRow, ScreenHead, TopBar, Empty, Badge } from '../ui';
import { useApp } from '../App';

async function garageAct(input: any, ok?: (r: any) => string) {
  try {
    const r = await call('app_garage', { clientId: clientId(), ...input });
    haptic('success'); if (ok) toast(ok(r));
    return r;
  } catch (e) { haptic('error'); toast(errorText(e)); return null; }
}

export function Garage() {
  const { reload, setTab, push } = useApp();
  const [g, setG] = useState<any>(null);
  const [rarity, setRarity] = useState<string | null>(null);
  const [opened, setOpened] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => call('app_garage', { action: 'list', rarity }).then(setG, (e) => toast(errorText(e))), [rarity]);
  useEffect(() => { load(); }, [load]);
  const run = async (input: any, ok?: (r: any) => string) => {
    if (busy) return null;
    setBusy(true);
    const r = await garageAct(input, ok);
    setBusy(false); load(); reload();
    return r;
  };

  if (!g) return <div className="screen"><ScreenHead brand="Гараж" title="Загрузка…" /></div>;
  const fill = g.owned / g.capacity;

  return (
    <div className="screen">
      <ScreenHead brand="Гараж" title="Мои машины" />

      <Card>
        <div className="row">
          <div className="grow">
            <div className="t-title">{g.owned} из {g.capacity} мест</div>
            <div className="t-small muted">Стоимость машин {money(g.value)}</div>
          </div>
          <Badge icon={ParkingSquare} tone={fill >= 0.8 ? 'rose' : ''} />
        </div>
        <div className={`progress${fill >= 0.8 ? ' warn' : ''}`}><i style={{ width: `${Math.min(100, fill * 100)}%` }} /></div>
        {fill >= 0.8 && <div className="t-small warning">Когда гараж заполнится, новые машины будут сразу продаваться</div>}
        {g.next_tier && (
          <button className="btn tonal block" disabled={busy} onClick={() => run({ action: 'upgrade' }, () => 'Гараж расширен')}>
            Расширить до {g.next_tier.total} мест · {money(g.next_tier.price)}
          </button>
        )}
      </Card>

      {g.offers.length > 0 && (
        <>
          <SectionTitle>Предложения</SectionTitle>
          <Card className="tight">
            {g.offers.map((o: any) => (
              <ListRow key={o.id} icon={Handshake} tone="gold" title={o.car_name}
                subtitle={o.buyer_id === g.me ? `${who({ username: o.seller_username, first_name: o.seller_name })} продаёт за ${money(o.price)}` : `Ты предложил за ${money(o.price)}`}
                trailing={o.buyer_id === g.me ? (
                  <div className="row gap-8">
                    <button className="btn primary s" onClick={() => run({ action: 'answer', id: o.id, accept: true }, () => 'Машина твоя')}><Check size={16} /></button>
                    <button className="btn s" onClick={() => run({ action: 'answer', id: o.id, accept: false }, () => 'Отклонено')}><X size={16} /></button>
                  </div>
                ) : <button className="btn s" onClick={() => run({ action: 'answer', id: o.id, accept: false }, () => 'Отменено')}>Отменить</button>} />
            ))}
          </Card>
        </>
      )}

      {g.containers.length > 0 && (
        <>
          <SectionTitle>Контейнеры</SectionTitle>
          <Card className="tight">
            {g.containers.map((c: any) => (
              <ListRow key={c.id} leading={<ContainerArt c={c} size={34} />} title={c.name} subtitle={`${c.qty} шт. · откроется без аукциона`}
                trailing={<button className="btn primary s" disabled={busy} onClick={async () => { const r = await run({ action: 'open', id: c.id }); if (r) setOpened(r); }}>Открыть</button>} />
            ))}
          </Card>
        </>
      )}

      <div className="chips">
        <button className={`chip${!rarity ? ' on' : ''}`} onClick={() => setRarity(null)}>Все</button>
        {RARITIES.map((r) => <button key={r} className={`chip${rarity === r ? ' on' : ''}`} onClick={() => setRarity(r)}>{RARITY[r].name}</button>)}
      </div>
      {g.cars.length ? (
        <div className="grid">{g.cars.map((c: any) => <CarCard key={c.user_car_id} car={c} onClick={() => push({ name: 'car', id: c.user_car_id })} />)}</div>
      ) : rarity ? <Empty icon={CarFront} title="Таких машин нет" /> : (
        <Empty icon={CarFront} title="Гараж пуст" text="Выиграй контейнер на аукционе — внутри будет машина." action="К аукциону" onAction={() => setTab('auction')} />
      )}

      <Sheet open={!!opened} onClose={() => setOpened(null)}>
        {opened && (
          <div className={`reveal r-${opened.car.rarity}`}>
            <div className="t-small muted">Контейнер открыт</div>
            <div className="reveal-art"><CarArt car={opened.car} height={170} studio /></div>
            <div className="t-headline-s">{opened.car.name}</div>
            <RarityTag r={opened.car.rarity} />
            <div className="t-title">Стоимость {money(opened.car.price)}</div>
            {opened.auto_sold != null && <div className="t-body muted">Гараж полон — продана за {money(opened.auto_sold)}</div>}
            <button className="btn primary l block" onClick={() => setOpened(null)}>Отлично</button>
          </div>
        )}
      </Sheet>
    </div>
  );
}

export function CarPage({ id }: { id: number }) {
  const { pop, reload } = useApp();
  const [car, setCar] = useState<any>(null);
  const [offer, setOffer] = useState(false);
  const [to, setTo] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { call('app_garage', { action: 'car', id }).then((c) => { setCar(c); setPrice(String(c.price)); }, (e) => { toast(errorText(e)); pop(); }); }, [id, pop]);
  const run = async (input: any, ok: (r: any) => string) => {
    setBusy(true);
    const r = await garageAct(input, ok);
    setBusy(false);
    if (r) { reload(); pop(); }
  };
  if (!car) return <div className="screen"><TopBar title="Машина" onBack={pop} /></div>;
  return (
    <div className={`screen r-${car.rarity}`}>
      <TopBar title={car.name} onBack={pop} />
      <Card className="flush">
        <div className="reveal-art" style={{ width: '100%', margin: 0 }}><CarArt car={car} height={180} studio /></div>
        <div className="col" style={{ padding: '12px 16px 16px', gap: 8 }}>
          <div className="row gap-8"><RarityTag r={car.rarity} /><span className="t-small muted">{car.country}</span></div>
          <div className="t-headline-s">{car.name}</div>
          <div className="t-body muted">Стоимость <b style={{ color: 'var(--text)' }}>{money(car.price)}</b></div>
        </div>
      </Card>
      <SectionTitle>Характеристики</SectionTitle>
      <Card>
        <Stat label="Скорость, км/ч" value={car.max_speed} max={360} />
        <Stat label="Мощность, л.с." value={car.power} max={1000} />
        <Stat label="Управляемость" value={car.handling} />
        <Stat label="Надёжность" value={car.reliability} />
        <div className="t-small muted">Разгон 0–100 км/ч за {(car.accel_x100 / 100).toFixed(1).replace('.', ',')} с</div>
      </Card>
      {car.sale && (
        <>
          <SectionTitle>Продать</SectionTitle>
          <Card className="tight">
            <ListRow icon={car.sale.quick ? Zap : Landmark} tone={car.sale.quick ? '' : 'teal'}
              title={car.sale.quick ? `Быстрая продажа · ${money(car.sale.amount)}` : `Государству · ${money(car.sale.amount)}`}
              subtitle={`Комиссия ${car.sale.rate / 100}%${car.sale.quick ? ' · доступна 15 минут после получения' : ''}`}
              onClick={() => !busy && run({ action: 'sell', id: car.user_car_id }, (r) => `Продано за ${money(r.sold.amount)}`)} />
            <ListRow icon={Handshake} tone="gold" title="Продать игроку" subtitle="Предложение придёт ему в бот" onClick={() => setOffer(true)} />
          </Card>
        </>
      )}
      <Sheet open={offer} onClose={() => setOffer(false)} title="Продать игроку">
        <input className="field" placeholder="@username или ID" value={to} onChange={(e) => setTo(e.target.value)} />
        <input className="field" inputMode="numeric" placeholder="Цена" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} />
        <div className="t-small muted">Предложение действует 15 минут. Комиссия при продаже игроку — 25% (VIP — 15%).</div>
        <button className="btn primary l block" disabled={busy || !to || !price} onClick={() => run({ action: 'offer', id: car.user_car_id, to, price: Number(price) }, () => 'Предложение отправлено')}>
          Предложить за {money(Number(price) || 0)}
        </button>
      </Sheet>
    </div>
  );
}
