import { useCallback, useEffect, useState } from 'react';
import { Crown, Sparkles, Coins, Trophy } from 'lucide-react';
import { call, clientId, errorText, haptic, toast, tg } from '../tg';
import { money, RARITY } from '../format';
import { CarCard, ContainerArt } from '../components';
import { AppBar, Sect, Li, Ic, Kv } from '../ui';
import { Chances } from './Auction';
import { useApp } from '../App';
import { t } from '../i18n';

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
  const { reload, pop } = useApp();
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
  return (
    <>
      <AppBar title={t('Магазин')} back={pop} />
      <div className="page">
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

        {bp && bp.season && (
          <div className="card" style={{ borderColor: 'rgba(180,107,255,.45)', background: 'linear-gradient(160deg, rgba(180,107,255,.18), var(--card) 60%)' }}>
            <div className="row"><Ic icon={Trophy} tone="gold" size={46} /><div className="grow"><div className="h3">{t('Премиум Battle Pass')}</div><div className="sm muted">{bp.season} · {t('машины, контейнеры и навык на каждом уровне')}</div></div></div>
            {bp.owned ? <div className="sm c-gold b">{t('Премиум уже открыт')}</div>
              : <button className="btn go xl w" disabled={stars.busy} onClick={() => stars.buy('bp')}>{t('Открыть за ⭐ {n}', { n: bp.stars })}</button>}
          </div>
        )}

        {s && (!s.vip.owned ? (
          <div className="card gold">
            <div className="row"><Ic icon={Crown} tone="gold" size={46} /><div className="grow"><div className="h3">{t('VIP навсегда')}</div><div className="sm muted">{t('+{n} мест в гараже · комиссии ниже · бонус ×2', { n: s.vip.bonus_slots })}</div></div></div>
            {vip && <button className="btn go xl w" disabled={stars.busy} onClick={() => stars.buy('vip')}>{t('Купить за ⭐ {n}', { n: vip.stars })}</button>}
            <button className="btn ghost w" disabled={busy} onClick={() => run('app_me', { action: 'vip' }, t('VIP активирован'))}>{t('или за {m} игровых', { m: money(s.vip.price) })}</button>
          </div>
        ) : <div className="card gold"><Li icon={Crown} tone="gold" title={t('У тебя VIP')} sub={t('Бонусы и сниженные комиссии уже действуют')} /></div>)}

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
