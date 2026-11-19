import { useCallback, useEffect, useState } from 'react';
import { call, clientId, errorText, haptic, toast } from '../tg';
import { money, who, RARITY, RARITIES } from '../format';
import { CarArt, CarCard, ContainerArt, RarityTag, Sheet, Stat } from '../components';

export function Garage({ focus, onBalance }: { focus?: number | null; onBalance: () => void }) {
  const [g, setG] = useState<any>(null);
  const [rarity, setRarity] = useState<string | null>(null);
  const [car, setCar] = useState<any>(null);
  const [opened, setOpened] = useState<any>(null);
  const [offer, setOffer] = useState<{ to: string; price: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => call('app_garage', { action: 'list', rarity }).then(setG, (e) => toast(errorText(e))), [rarity]);
  useEffect(() => { load(); }, [load]);
  const openCar = (id: number) => call('app_garage', { action: 'car', id }).then(setCar, (e) => toast(errorText(e)));
  useEffect(() => { if (focus) openCar(focus); }, [focus]);

  const act = async (input: any, ok?: (r: any) => string) => {
    if (busy) return null;
    setBusy(true);
    try {
      const r = await call('app_garage', { clientId: clientId(), ...input });
      haptic('success'); if (ok) toast(ok(r));
      onBalance(); load();
      setBusy(false);
      return r;
    } catch (e) { haptic('error'); toast(errorText(e)); setBusy(false); return null; }
  };

  if (!g) return <div className="center hint">Загрузка…</div>;
  const fill = g.owned / g.capacity;

  return (
    <div className="page">
      <div className="glass garage-head">
        <div>
          <div className="hint small">Гараж</div>
          <div className="big-num">{g.owned}<span className="hint">/{g.capacity}</span></div>
        </div>
        <div className="grow">
          <div className={`cap-bar${fill >= 0.8 ? ' warn' : ''}`}><i style={{ width: `${Math.min(100, fill * 100)}%` }} /></div>
          <div className="hint small">Стоимость машин: <b>{money(g.value)}</b></div>
          {fill >= 0.8 && <div className="warn-text small">Когда гараж заполнится, новые машины будут сразу продаваться</div>}
        </div>
        {g.next_tier && (
          <button className="btn small" disabled={busy} onClick={() => act({ action: 'upgrade' }, () => 'Гараж расширен!')}>
            +{g.next_tier.total - g.capacity} мест<br /><span className="small">{money(g.next_tier.price)}</span>
          </button>
        )}
      </div>

      {g.offers.length > 0 && (
        <div className="section">
          <h3>Предложения</h3>
          {g.offers.map((o: any) => (
            <div key={o.id} className="glass row-card">
              <div className="grow">
                <b>{RARITY[o.rarity]?.icon} {o.car_name}</b>
                <div className="hint small">{o.seller_id === g.me ? 'ты продаёшь' : `продаёт ${who({ username: o.seller_username, first_name: o.seller_name })}`} за {money(o.price)}</div>
              </div>
              {o.buyer_id === g.me ? (
                <>
                  <button className="btn small primary" onClick={() => act({ action: 'answer', id: o.id, accept: true }, () => 'Машина твоя!')}>Купить</button>
                  <button className="btn small ghost" onClick={() => act({ action: 'answer', id: o.id, accept: false }, () => 'Отклонено')}>✕</button>
                </>
              ) : <button className="btn small ghost" onClick={() => act({ action: 'answer', id: o.id, accept: false }, () => 'Предложение отменено')}>Отменить</button>}
            </div>
          ))}
        </div>
      )}

      {g.containers.length > 0 && (
        <div className="section">
          <h3>Контейнеры</h3>
          <div className="hscroll">
            {g.containers.map((c: any) => (
              <button key={c.id} className="glass ct-item" disabled={busy} onClick={async () => {
                const r = await act({ action: 'open', id: c.id });
                if (r) setOpened(r);
              }}>
                <ContainerArt c={c} size={40} />
                <b className="small">{c.name}</b>
                <span className="pill">×{c.qty} · открыть</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="chips">
        <button className={!rarity ? 'on' : ''} onClick={() => setRarity(null)}>Все</button>
        {RARITIES.map((r) => <button key={r} className={rarity === r ? 'on' : ''} onClick={() => setRarity(r)}>{RARITY[r].icon} {RARITY[r].name}</button>)}
      </div>
      {g.cars.length ? (
        <div className="grid">
          {g.cars.map((c: any) => <CarCard key={c.user_car_id} car={c} onClick={() => openCar(c.user_car_id)} />)}
        </div>
      ) : <div className="empty glass">Пусто. Выиграй контейнер на аукционе!</div>}

      <Sheet open={!!car} onClose={() => { setCar(null); setOffer(null); }}>
        {car && (
          <div className={`car-detail r-${car.rarity}`}>
            <div className="reveal-art"><CarArt car={car} height={170} studio /></div>
            <h2>{car.name}</h2>
            <div className="row-gap"><RarityTag r={car.rarity} /><span className="hint small">{car.country}</span></div>
            <div className="price-line">Стоимость <b>{money(car.price)}</b></div>
            <Stat label="Скорость" value={car.max_speed} max={360} />
            <Stat label="Мощность" value={car.power} max={1000} />
            <Stat label="Управляемость" value={car.handling} />
            <Stat label="Надёжность" value={car.reliability} />
            <div className="hint small">Разгон 0–100: {(car.accel_x100 / 100).toFixed(1).replace('.', ',')} с</div>
            {car.sale && (
              <>
                <button className="btn primary wide" disabled={busy} onClick={async () => { if (await act({ action: 'sell', id: car.user_car_id }, (r) => `Продано за ${money(r.sold.amount)}`)) setCar(null); }}>
                  {car.sale.quick ? '⚡ Быстрая продажа' : '🏛 Продать государству'} за {money(car.sale.amount)}
                </button>
                <div className="hint small center-text">Комиссия {car.sale.rate / 100}%{car.sale.quick ? ' · быстрая продажа доступна 15 минут после получения' : ''}</div>
                {!offer ? <button className="btn ghost wide" onClick={() => setOffer({ to: '', price: String(car.price) })}>🤝 Продать игроку</button> : (
                  <div className="offer-form">
                    <input className="field" placeholder="@username или ID" value={offer.to} onChange={(e) => setOffer({ ...offer, to: e.target.value })} />
                    <input className="field" inputMode="numeric" placeholder="Цена" value={offer.price} onChange={(e) => setOffer({ ...offer, price: e.target.value.replace(/\D/g, '') })} />
                    <button className="btn primary wide" disabled={busy || !offer.to || !offer.price} onClick={async () => {
                      if (await act({ action: 'offer', id: car.user_car_id, to: offer.to, price: Number(offer.price) }, () => 'Предложение отправлено — игрок получит его в боте')) { setOffer(null); setCar(null); }
                    }}>Предложить за {money(Number(offer.price) || 0)}</button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Sheet>

      <Sheet open={!!opened} onClose={() => setOpened(null)}>
        {opened && (
          <div className={`reveal r-${opened.car.rarity}`}>
            <div className="reveal-glow" />
            <div className="hint">Контейнер открыт!</div>
            <div className="reveal-art"><CarArt car={opened.car} height={170} studio /></div>
            <h2>{opened.car.name}</h2>
            <RarityTag r={opened.car.rarity} />
            <div className="reveal-price">Стоимость {money(opened.car.price)}</div>
            {opened.auto_sold != null && <div className="hint">Гараж полон — продана за {money(opened.auto_sold)}</div>}
            <button className="btn primary wide" onClick={() => setOpened(null)}>Отлично</button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
