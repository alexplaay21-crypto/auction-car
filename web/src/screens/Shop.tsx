import { useCallback, useEffect, useState } from 'react';
import { Crown, ParkingSquare, Gift, Ticket, Percent, Sparkles } from 'lucide-react';
import { call, clientId, errorText, haptic, toast } from '../tg';
import { money, RARITY } from '../format';
import { CarCard, ContainerArt } from '../components';
import { Card, Badge, SectionTitle, ListRow, ScreenHead, TopBar } from '../ui';
import { Chances } from './Auction';
import { useApp } from '../App';

export function Shop() {
  const { reload, push } = useApp();
  const [s, setS] = useState<any>(null);
  const [cat, setCat] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => call('app_shop', { action: 'list' }).then(setS, (e) => toast(errorText(e))), []);
  useEffect(() => { load(); call('app_shop', { action: 'catalog' }).then(setCat, () => {}); }, [load]);

  const run = async (name: string, input: any, ok: string) => {
    if (busy) return;
    setBusy(true);
    try { await call(name, { clientId: clientId(), ...input }); haptic('success'); toast(ok); reload(); load(); }
    catch (e) { haptic('error'); toast(errorText(e)); }
    setBusy(false);
  };

  if (!s) return <div className="screen"><ScreenHead brand="Магазин" title="Загрузка…" /></div>;
  return (
    <div className="screen">
      <ScreenHead brand="Магазин" title="Улучшения" trailing={<span className="btn tonal s num">{money(s.balance)}</span>} />

      {!s.vip.owned ? (
        <Card style={{ background: 'linear-gradient(135deg, rgba(255,194,61,.16), var(--surface) 60%)' }}>
          <div className="row">
            <div className="grow">
              <div className="t-title-l">VIP навсегда</div>
              <div className="t-small muted">Один раз — и навсегда</div>
            </div>
            <Badge icon={Crown} tone="gold" />
          </div>
          <ListRow icon={ParkingSquare} tone="gold" title={`+${s.vip.bonus_slots} мест в гараже`} />
          <ListRow icon={Percent} tone="gold" title="Комиссии ниже" subtitle="Быстрая продажа 5%, продажа игроку 15%, переводы без комиссии" />
          <ListRow icon={Gift} tone="gold" title="Ежедневный бонус ×2" />
          <button className="btn primary l block" disabled={busy} onClick={() => run('app_me', { action: 'vip' }, 'VIP активирован')}>Купить за {money(s.vip.price)}</button>
        </Card>
      ) : (
        <Card><ListRow icon={Crown} tone="gold" title="У тебя VIP" subtitle="Бонусы и сниженные комиссии уже действуют" /></Card>
      )}

      {s.tier && (
        <Card className="tight">
          <ListRow icon={ParkingSquare} title={`Гараж до ${s.tier.total} мест`} subtitle="Места остаются навсегда"
            trailing={<button className="btn primary s" disabled={busy} onClick={() => run('app_garage', { action: 'upgrade' }, 'Гараж расширен')}>{money(s.tier.price)}</button>} />
        </Card>
      )}

      {s.lots.length > 0 && (
        <>
          <SectionTitle>Наборы</SectionTitle>
          <Card className="tight">
            {s.lots.map((l: any) => (
              <ListRow key={l.id} icon={Sparkles} tone="rose" title={l.title}
                subtitle={l.description || [l.money ? money(l.money) : null, l.container_qty ? `${l.container_name} ×${l.container_qty}` : null,
                  l.car_name ? `${RARITY[l.car_rarity]?.name ?? ''} ${l.car_name}` : null, l.vip ? 'VIP' : null].filter(Boolean).join(' · ')}
                trailing={<button className="btn primary s" disabled={busy || (l.per_user_limit && l.bought >= l.per_user_limit)} onClick={() => run('app_shop', { action: 'buy', id: l.id }, 'Куплено')}>{money(l.price)}</button>} />
            ))}
          </Card>
        </>
      )}

      <Card className="tight"><ListRow icon={Ticket} tone="teal" title="Ввести промокод" onClick={() => push({ name: 'promo' })} /></Card>

      {cat && (
        <>
          <SectionTitle>Контейнеры и шансы</SectionTitle>
          <Card className="tight">
            {cat.containers.map((c: any) => (
              <ListRow key={c.id} leading={<ContainerArt c={c} size={34} />} title={c.name}
                subtitle={<><span>старт {money(c.price)} · {cat.cars.filter((x: any) => x.container_id === c.id).length} машин</span><Chances ch={c.chances} compact /></>}
                onClick={() => push({ name: 'catalog', id: c.id })} />
            ))}
          </Card>
        </>
      )}
    </div>
  );
}

export function CatalogPage({ id }: { id: number }) {
  const { pop } = useApp();
  const [cat, setCat] = useState<any>(null);
  useEffect(() => { call('app_shop', { action: 'catalog' }).then(setCat, (e) => toast(errorText(e))); }, []);
  const c = cat?.containers.find((x: any) => x.id === id);
  return (
    <div className="screen">
      <TopBar title={c?.name ?? 'Контейнер'} onBack={pop} />
      {c && (
        <>
          <Card>
            <div className="lot-hero"><ContainerArt c={c} size={150} studio /></div>
            <div className="t-title">Стартовая ставка {money(c.price)}</div>
            <Chances ch={c.chances} />
            <div className="t-small muted">Сначала выпадает редкость по этим шансам, потом одна из машин этой редкости.</div>
          </Card>
          <SectionTitle>Машины внутри</SectionTitle>
          <div className="grid">{cat.cars.filter((x: any) => x.container_id === id).map((x: any) => <CarCard key={x.id} car={x} />)}</div>
        </>
      )}
    </div>
  );
}
