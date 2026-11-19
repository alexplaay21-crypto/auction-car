import { useCallback, useEffect, useState } from 'react';
import { Crown, Sparkles, Coins, Trophy, ParkingSquare, Gift, Zap, Landmark, Store, Send } from 'lucide-react';
import { call, clientId, errorText, haptic, toast, tg } from '../tg';
import { money, RARITY } from '../format';
import { CarCard, ContainerArt, CarArt, RarityTag, ProfileBg } from '../components';
import { AppBar, Sect, Li, Ic, Kv } from '../ui';
import { Chances } from './Auction';
import { useApp } from '../App';
import { t } from '../i18n';

const PERK_ICON: Record<string, any> = { garage: ParkingSquare, bonus: Gift, quick: Zap, state: Landmark, market: Store, transfer: Send, badge: Crown };

export function SeasonCar({ car, label }: { car: any; label: string }) {
  return (
    <div className={`bp-car r-${car.rarity}`}>
      <div className="bp-car-art"><CarArt car={car} height={84} studio /></div>
      <div className="bp-car-info"><span className="xs muted">{label}</span><b className="ell2">{car.name}</b><RarityTag r={car.rarity} /></div>
    </div>
  );
}

const BADGE: Record<string, string> = { popular: 'Популярный', best: 'Выгодно', max: 'Максимум выгоды' };

// Оплата звёздами: счёт создаёт сервер, Telegram показывает окно оплаты, товар выдаёт бот.
export function useStarsBuy(after: () => void) {
  const [busy, setBusy] = useState(false);
  const buy = async (product: string) => {
    if (busy) return;
    if (!tg?.openInvoice) { toast(errorText({ code: 'STARS_UNAVAILABLE' })); return; }
    setBusy(true);
    try {
      const { link } = await call('app_shop', { action: 'invoice', product });
      tg.openInvoice(link, (status: string) => {
        setBusy(false);
        if (status === 'paid') {
          haptic('success'); toast(t('Оплачено! Зачисляем…'));
          // товар выдаёт бот по сообщению об оплате — обновляем, пока не придёт
          let n = 0; const i = setInterval(() => { after(); if (++n >= 4) clearInterval(i); }, 1500);
        } else if (status === 'failed') { haptic('error'); toast(t('Оплата не прошла')); }
      });
    } catch (e) { setBusy(false); haptic('error'); toast(errorText(e)); }
  };
  return { buy, busy };
}

export function ShopPage() {
  const { reload, pop, push } = useApp();
  const [s, setS] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => call('app_shop', { action: 'list' }).then(setS, (e) => toast(errorText(e))), []);
  useEffect(() => { load(); }, [load]);
  const stars = useStarsBuy(() => { reload(); load(); });
  const run = async (name: string, input: any, ok: string) => {
    if (busy) return;
    setBusy(true);
    try { await call(name, { clientId: clientId(), ...input }); haptic('success'); toast(ok); reload(); load(); } catch (e) { haptic('error'); toast(errorText(e)); }
    setBusy(false);
  };
  const packs = s?.stars?.filter((p: any) => p.kind === 'money') ?? [];
  const vip = s?.stars?.find((p: any) => p.kind === 'vip');
  const bp = s?.stars?.find((p: any) => p.kind === 'bp');
  const dx = s?.stars?.find((p: any) => p.kind === 'bpdx');
  const lv = s?.stars?.find((p: any) => p.kind === 'bplvl');
  return (
    <>
      <AppBar title={t('Магазин')} back={pop} />
      <div className="page">
        {s && vip && (
          <div className="card gold">
            <div className="row"><Ic icon={Crown} tone="gold" size={46} /><div className="grow"><div className="h3">{s.vip.owned ? t('У тебя VIP') : t('VIP навсегда')}</div><div className="sm muted">{s.vip.owned ? t('Все привилегии уже действуют') : t('Покупается один раз и остаётся навсегда')}</div></div></div>
            <div className="perks">
              {vip.perks?.map(([k, title, sub]: [string, string, string]) => {
                const I = PERK_ICON[k] ?? Crown;
                return <div key={k} className="perk"><I size={18} className="c-gold" /><div><div className="sb sm">{t(title)}</div><div className="xs muted">{t(sub)}</div></div></div>;
              })}
            </div>
            {!s.vip.owned && <button className="btn go xl w" disabled={stars.busy} onClick={() => stars.buy('vip')}>{t('Купить VIP за ⭐ {n}', { n: vip.stars })}</button>}
          </div>
        )}

        {bp && bp.season && (
          <div className="card" style={{ borderColor: 'rgba(180,107,255,.45)', background: 'linear-gradient(160deg, rgba(180,107,255,.18), var(--card) 60%)' }}>
            <div className="row"><Ic icon={Trophy} tone="gold" size={46} /><div className="grow"><div className="h3">Battle Pass · {bp.season}</div><div className="sm muted">{t('машины, контейнеры и навык на каждом уровне')}</div></div></div>
            {!bp.owned && bp.car && <SeasonCar car={bp.car} label={t('Сразу в гараж с премиумом')} />}
            {!bp.owned ? <button className="btn go xl w" disabled={stars.busy} onClick={() => stars.buy('bp')}>{t('Премиум за ⭐ {n}', { n: bp.stars })}</button>
              : <div className="sm c-gold b">{t('Премиум уже открыт')}</div>}
            {dx && !dx.owned && (
              <div className="dx-box">
                <div className="row g6"><span className="rtag r-mythic">{t('Делюкс')}</span><span className="sm muted">{t('+{n} уровней и легендарная машина', { n: dx.levels ?? 5 })}</span></div>
                {dx.car && <SeasonCar car={dx.car} label={t('Сразу в гараж с делюксом')} />}
                {bp.owned ? (!dx.blocked && <button className="btn go w" disabled={stars.busy} onClick={() => stars.buy('bpdx')}>💎 {t('Делюкс за ⭐ {s}', { s: dx.stars })}</button>)
                  : <div className="xs faint">{t('Откроется после покупки премиума · ⭐ {s}', { s: dx.stars })}</div>}
              </div>
            )}
            {lv && !lv.blocked && <button className="btn ghost w" disabled={stars.busy} onClick={() => stars.buy('bplvl')}>{t('Открыть следующий уровень · ⭐ {s}', { s: lv.stars })}</button>}
          </div>
        )}

        <Sect action={t('Все')} onAction={() => push({ name: 'style' })}>{t('Оформление профиля')}</Sect>
        <button className="card press" style={{ padding: 12 }} onClick={() => push({ name: 'style' })}>
          <div className="cos-strip">{['neon', 'flames', 'aurora', 'goldrush'].map((id) => <span key={id}><ProfileBg id={id} /></span>)}</div>
          <div className="row between"><div className="col"><b>{t('Фоны и рамки профиля')}</b><span className="xs muted">{t('Анимации, узоры и эффекты — видят все игроки')}</span></div><span className="btn go s">{t('Смотреть')}</span></div>
        </button>

        <Sect>{t('Игровая валюта')}</Sect>
        <div className="xs muted" style={{ marginTop: -6 }}>{t('Чем больше пакет — тем больше денег за каждую звезду')}</div>
        <div className="grid2">
          {packs.map((p: any) => (
            <button key={p.id} className={`pack press${p.badge ? ' hot ' + p.badge : ''}`} disabled={stars.busy} onClick={() => stars.buy(p.id)}>
              {p.badge && <span className="pack-badge">{t(BADGE[p.badge])}</span>}
              <Coins size={26} className="c-gold" />
              <div className="pack-sum">{money(p.money)}</div>
              <div className="pack-bonus">{p.bonus_pct > 0 ? t('+{n}% выгоды', { n: p.bonus_pct }) : t('базовый курс')}</div>
              <span className="btn go s w">⭐ {p.stars}</span>
            </button>
          ))}
        </div>

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
        <div className="xs faint center">{t('Покупки за Telegram Stars зачисляются сразу после оплаты.')}</div>
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
