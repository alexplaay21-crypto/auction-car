import { useCallback, useEffect, useState } from 'react';
import { Crown, ParkingSquare, Gift, Ticket, Percent, Sparkles } from 'lucide-react';
import { call, clientId, errorText, haptic, toast } from '../tg';
import { money, RARITY } from '../format';
import { CarCard, ContainerArt } from '../components';
import { AppBar, Sect, Li, Ic, Kv } from '../ui';
import { Chances } from './Auction';
import { useApp } from '../App';
import { t } from '../i18n';

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
      <AppBar title={t('Магазин')} back={pop} />
      <div className="page">
        {!s ? null : !s.vip.owned ? (
          <div className="card gold">
            <div className="row"><Ic icon={Crown} tone="gold" size={46} /><div className="grow"><div className="h2">{t('VIP навсегда')}</div><div className="sm muted">{t('Покупается один раз')}</div></div></div>
            <Li icon={ParkingSquare} tone="gold" title={t('+{n} мест в гараже', { n: s.vip.bonus_slots })} />
            <Li icon={Percent} tone="gold" title={t('Комиссии ниже')} sub={t('Быстрая продажа 5%, рынок и игрокам 15%, переводы 0%')} />
            <Li icon={Gift} tone="gold" title={t('Ежедневный бонус ×2')} />
            <button className="btn go xl w" disabled={busy} onClick={() => run('app_me', { action: 'vip' }, t('VIP активирован'))}>{t('Купить за {m}', { m: money(s.vip.price) })}</button>
          </div>
        ) : <div className="card gold"><Li icon={Crown} tone="gold" title={t('У тебя VIP')} sub={t('Бонусы и сниженные комиссии уже действуют')} /></div>}

        {s?.tier && (
          <div className="card list">
            <Li icon={ParkingSquare} title={t('Гараж до {n} мест', { n: s.tier.total })} sub={t('Места остаются навсегда')} right={<button className="btn go s" disabled={busy} onClick={() => run('app_garage', { action: 'upgrade' }, t('Гараж расширен'))}>{money(s.tier.price)}</button>} />
          </div>
        )}

        {s?.lots?.length > 0 && (
          <>
            <Sect>{t('Наборы')}</Sect>
            <div className="card list">
              {s.lots.map((l: any) => (
                <Li key={l.id} icon={Sparkles} tone="red" title={l.title}
                  sub={l.description || [l.money ? money(l.money) : null, l.container_qty ? `${l.container_name} ×${l.container_qty}` : null, l.car_name ? `${RARITY[l.car_rarity]?.name ?? ''} ${l.car_name}` : null, l.vip ? 'VIP' : null].filter(Boolean).join(' · ')}
                  right={<button className="btn go s" disabled={busy || (l.per_user_limit && l.bought >= l.per_user_limit)} onClick={() => run('app_shop', { action: 'buy', id: l.id }, t('Куплено'))}>{money(l.price)}</button>} />
              ))}
            </div>
          </>
        )}
        <div className="card list"><Li icon={Ticket} tone="blue" title={t('Ввести промокод')} onClick={() => push({ name: 'promo' })} /></div>
      </div>
    </>
  );
}

export function CatalogPage({ id }: { id: number }) {
  const { pop } = useApp();
  const [cat, setCat] = useState<any>(null);
  useEffect(() => { call('app_shop', { action: 'catalog' }).then(setCat, (e) => toast(errorText(e))); }, [id]);
  const c = cat?.containers.find((x: any) => x.id === id);
  return (
    <>
      <AppBar title={c ? t(c.name) : t('Контейнер')} back={pop} />
      <div className="page">
        {c && (
          <>
            <div className="card pad0">
              <div className="hero-img"><ContainerArt c={c} size={150} studio /></div>
              <div className="col g8" style={{ padding: 14 }}>
                <Chances ch={c.chances} />
              </div>
            </div>
            <Sect>{t('Машины внутри')}</Sect>
            <div className="grid2">{cat.cars.filter((x: any) => x.container_id === id).map((x: any) => <CarCard key={x.id} car={x} />)}</div>
          </>
        )}
      </div>
    </>
  );
}
