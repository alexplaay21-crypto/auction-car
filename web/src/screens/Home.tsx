import { useEffect, useState } from 'react';
import { Gift, Flag, Store, Trophy, CarFront, Clock } from 'lucide-react';
import { call, clientId, errorText, haptic, toast } from '../tg';
import { money, left } from '../format';
import { t } from '../i18n';
import { ContainerArt } from '../components';
import { AppBar, Sect, Nick, Ic } from '../ui';
import { useApp } from '../App';

// Главная — коротко: бонус, аукцион, четыре раздела, тройка лидеров.
export function Home() {
  const { me, reload, setTab, push } = useApp();
  const [room, setRoom] = useState<any>(undefined);
  const [bp, setBp] = useState<any>(null);
  const [top, setTop] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => {
    call('app_room', { action: 'state' }).then((r) => setRoom(r.room), () => setRoom(null));
    call('app_bp', {}).then(setBp, () => {});
    call('app_shop', { action: 'top', kind: 'balance' }).then((x) => setTop(x.list.slice(0, 3)), () => setTop([]));
    const i = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(i);
  }, []);

  const bonus = async () => {
    if (busy || !me.bonus.available) return;
    setBusy(true);
    try { const r = await call('app_me', { action: 'bonus', clientId: clientId() }); haptic('success'); toast(t('Бонус +{m}', { m: money(r.result.amount) })); await reload(); }
    catch (e) { haptic('error'); toast(errorText(e)); }
    setBusy(false);
  };
  const b = me.bonus;
  const wait = Math.max(0, b.next_at - (b.now + (Date.now() / 1000 - (me._loaded ?? Date.now() / 1000))));
  const a = room?.auction;

  return (
    <>
      <AppBar title="Car Auction" />
      <div className="page">
        <button className={`card press${b.available ? ' accent' : ''}`} onClick={bonus} disabled={busy || !b.available} style={{ padding: 12 }}>
          <div className="row">
            <Ic icon={b.available ? Gift : Clock} tone={b.available ? '' : 'gray'} />
            <div className="grow">
              <div className="h3">{t('Бонус {m}', { m: money(b.amount) })}</div>
              <div className="sm muted">{b.rich ? t('Доступен при балансе меньше {m}', { m: money(b.cap) }) : b.available ? t('В 00:00 и 12:00 по Москве · +100 опыта') : t('Через {t}', { t: left(wait) })}</div>
            </div>
            {b.available && <span className="btn go s">{t('Забрать')}</span>}
          </div>
        </button>

        <button className={`card pad0 press${a?.status === 'active' ? ' accent' : ''}`} onClick={() => setTab('auction')}>
          <div className="hero-img short">
            <ContainerArt c={a?.container ?? { id: 3, country: 'США' }} size={130} studio />
            <span className="tag">{a?.status === 'active' ? <><span className="live-dot" /> {t('Идут торги')}</> : t('Аукцион')}</span>
          </div>
          <div className="row" style={{ padding: '10px 14px' }}>
            <div className="grow">
              <div className="h3 ell">{a?.status === 'active' ? a.container.name : t('Аукцион контейнеров')}</div>
              <div className="sm muted">{a?.status === 'active' ? t('Ставка {m} · игроков: {n}', { m: money(a.current), n: room.count }) : t('Последняя ставка забирает машину')}</div>
            </div>
            <span className="btn go s">{t('Играть')}</span>
          </div>
        </button>

        <div className="grid2">
          <button className="tile race press" onClick={() => setTab('race')}><span className="checker" /><Ic icon={Flag} tone="blue" size={34} /><div className="t">{t('Гонки')}</div></button>
          <button className="tile market press" onClick={() => setTab('market')}><Ic icon={Store} tone="green" size={34} /><div className="t">{t('Рынок')}</div></button>
          <button className="tile bp press" onClick={() => push({ name: 'bp' })}>
            <Ic icon={Trophy} tone="gold" size={34} /><div className="t">Battle Pass</div>
            <div className="s">{bp?.season ? t('Уровень {a} из {b}', { a: bp.level, b: bp.levels.length }) : t('Сезон не идёт')}</div>
          </button>
          <button className="tile garage press" onClick={() => push({ name: 'garage' })}><Ic icon={CarFront} tone="gold" size={34} /><div className="t">{t('Гараж')}</div><div className="s">{me.garage.owned} / {me.garage.capacity}</div></button>
        </div>

        <Sect action={t('Все')} onAction={() => push({ name: 'leaders' })}>{t('Лидеры')}</Sect>
        <div className="card list">
          {top?.map((u, i) => (
            <div key={u.id} className="li"><span className="b" style={{ width: 22 }}>{['🥇', '🥈', '🥉'][i]}</span><span className="grow"><Nick u={u} /></span><b className="num">{money(u.value)}</b></div>
          ))}
        </div>
      </div>
    </>
  );
}
