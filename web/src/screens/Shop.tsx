import { useCallback, useEffect, useState } from 'react';
import { Crown, ParkingSquare, Gift, Ticket, Percent, Sparkles } from 'lucide-react';
import { call, clientId, errorText, haptic, toast } from '../tg';
import { money, RARITY } from '../format';
import { CarCard, ContainerArt } from '../components';
import { AppBar, Sect, Li, Ic, Kv, Spark, Delta } from '../ui';
import { Chances } from './Auction';
import { useApp } from '../App';

export function ShopPage() {
  const { reload, push, pop } = useApp();
  const [s, setS] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => call('app_shop', { action: 'list' }).then(setS, (e) => toast(errorText(e))), []);
  useEffect(() => { load(); }, [load]);
  const run = async (name: string, input: any, ok: string) => {
    if (busy) return;
    setBusy(true);
    try { await call(name, { clientId: clientId(), ...input }); haptic('success'); toast(ok); reload(); load(); } catch (e) { haptic('error'); toast(errorText(e)); }
    setBusy(false);
  };
  return (
    <>
      <AppBar title="Магазин" back={pop} />
      <div className="page">
        {!s ? null : !s.vip.owned ? (
          <div className="card gold">
            <div className="row"><Ic icon={Crown} tone="gold" size={46} /><div className="grow"><div className="h2">VIP навсегда</div><div className="sm muted">Покупается один раз</div></div></div>
            <Li icon={ParkingSquare} tone="gold" title={`+${s.vip.bonus_slots} мест в гараже`} />
            <Li icon={Percent} tone="gold" title="Комиссии ниже" sub="Быстрая продажа 5%, рынок и игрокам 15%, переводы 0%" />
            <Li icon={Gift} tone="gold" title="Ежедневный бонус ×2" />
            <button className="btn go xl w" disabled={busy} onClick={() => run('app_me', { action: 'vip' }, 'VIP активирован')}>Купить за {money(s.vip.price)}</button>
          </div>
        ) : <div className="card gold"><Li icon={Crown} tone="gold" title="У тебя VIP" sub="Бонусы и сниженные комиссии уже действуют" /></div>}

        {s?.tier && (
          <div className="card list">
            <Li icon={ParkingSquare} title={`Гараж до ${s.tier.total} мест`} sub="Места остаются навсегда" right={<button className="btn go s" disabled={busy} onClick={() => run('app_garage', { action: 'upgrade' }, 'Гараж расширен')}>{money(s.tier.price)}</button>} />
          </div>
        )}

        {s?.lots?.length > 0 && (
          <>
            <Sect>Наборы</Sect>
            <div className="card list">
              {s.lots.map((l: any) => (
                <Li key={l.id} icon={Sparkles} tone="red" title={l.title}
                  sub={l.description || [l.money ? money(l.money) : null, l.container_qty ? `${l.container_name} ×${l.container_qty}` : null, l.car_name ? `${RARITY[l.car_rarity]?.name ?? ''} ${l.car_name}` : null, l.vip ? 'VIP' : null].filter(Boolean).join(' · ')}
                  right={<button className="btn go s" disabled={busy || (l.per_user_limit && l.bought >= l.per_user_limit)} onClick={() => run('app_shop', { action: 'buy', id: l.id }, 'Куплено')}>{money(l.price)}</button>} />
              ))}
            </div>
          </>
        )}
        <div className="card list"><Li icon={Ticket} tone="blue" title="Ввести промокод" onClick={() => push({ name: 'promo' })} /></div>
      </div>
    </>
  );
}

export function CatalogPage({ id }: { id: number }) {
  const { pop } = useApp();
  const [cat, setCat] = useState<any>(null);
  const [price, setPrice] = useState<any>(null);
  useEffect(() => {
    call('app_shop', { action: 'catalog' }).then(setCat, (e) => toast(errorText(e)));
    call('app_player', { action: 'prices' }).then((r) => setPrice(r.containers.find((x: any) => x.id === id)), () => {});
  }, [id]);
  const c = cat?.containers.find((x: any) => x.id === id);
  return (
    <>
      <AppBar title={c?.name ?? 'Контейнер'} back={pop} />
      <div className="page">
        {c && (
          <>
            <div className="card pad0">
              <div className="hero-img"><ContainerArt c={c} size={150} studio /></div>
              <div className="col g8" style={{ padding: 14 }}>
                <div className="row between"><div className="h2">{money(c.price)}</div>{price && <div className="row g8"><Spark data={price.history} up={price.change >= 0} /><Delta v={price.change} /></div>}</div>
                {price && <Kv k="Базовая цена" v={`${money(price.base_price)} (${price.vs_base > 0 ? '+' : ''}${price.vs_base}%)`} />}
                <div className="xs faint">Стартовая цена меняется после каждого контейнера: дорогие торги поднимают её, пустые — снижают (не больше 10% за раз).</div>
                <Chances ch={c.chances} />
              </div>
            </div>
            <Sect>Машины внутри</Sect>
            <div className="grid2">{cat.cars.filter((x: any) => x.container_id === id).map((x: any) => <CarCard key={x.id} car={x} />)}</div>
          </>
        )}
      </div>
    </>
  );
}
