import { useEffect, useState } from 'react';
import { Gift, Flag, Store, Trophy, CarFront, Crown, ChevronRight } from 'lucide-react';
import { call, clientId, errorText, haptic, toast } from '../tg';
import { money } from '../format';
import { ContainerArt } from '../components';
import { AppBar, Sect, Li, Nick, Spark, Delta, Ic } from '../ui';
import { useApp } from '../App';

export function Home() {
  const { me, reload, setTab, push } = useApp();
  const [room, setRoom] = useState<any>(undefined);
  const [prices, setPrices] = useState<any[] | null>(null);
  const [bp, setBp] = useState<any>(null);
  const [top, setTop] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    call('app_room', { action: 'state' }).then((r) => setRoom(r.room), () => setRoom(null));
    call('app_player', { action: 'prices' }).then((r) => setPrices(r.containers), () => setPrices([]));
    call('app_bp', {}).then(setBp, () => {});
    call('app_shop', { action: 'top', kind: 'balance' }).then((t) => setTop(t.list.slice(0, 3)), () => setTop([]));
  }, []);

  const bonus = async () => {
    if (busy) return;
    setBusy(true);
    try { const r = await call('app_me', { action: 'bonus', clientId: clientId() }); haptic('success'); toast(`Бонус +${money(r.result.amount)}`); await reload(); }
    catch (e) { haptic('error'); toast(errorText(e)); }
    setBusy(false);
  };

  const a = room?.auction;
  const bpPct = bp ? Math.min(100, ((bp.xp % bp.per_level) / bp.per_level) * 100) : 0;
  return (
    <>
      <AppBar title="Car Auction" />
      <div className="page">
        {me.bonus.available && (
          <button className="card accent press" onClick={bonus} disabled={busy}>
            <div className="row"><Ic icon={Gift} /><div className="grow"><div className="h3">Ежедневный бонус</div><div className="sm muted">Забери {money(me.bonus.amount)} и +100 опыта Battle Pass</div></div><span className="btn go s">Забрать</span></div>
          </button>
        )}

        <button className={`card pad0 press${a?.status === 'active' ? ' accent' : ''}`} onClick={() => setTab('auction')}>
          <div className="hero-img">
            <ContainerArt c={a?.container ?? prices?.[0] ?? { id: 1, country: 'Япония' }} size={150} studio />
            <span className="tag">{a?.status === 'active' ? <><span className="live-dot" /> Идут торги</> : 'Аукцион'}</span>
          </div>
          <div className="row" style={{ padding: 14 }}>
            <div className="grow">
              <div className="h3 ell">{a?.status === 'active' ? a.container.name : room ? `Комната №${room.number}` : 'Аукцион контейнеров'}</div>
              <div className="sm muted">{a?.status === 'active' ? `Ставка ${money(a.current)} · ${room.count} игроков` : 'Последняя ставка забирает контейнер с машиной'}</div>
            </div>
            <span className="btn go s">Играть</span>
          </div>
        </button>

        <div className="grid2">
          <button className="tile race press" onClick={() => setTab('race')}><span className="checker" /><Ic icon={Flag} tone="blue" /><div className="t">Гонки</div><div className="s">Заезд против бота или вызов игроку</div></button>
          <button className="tile market press" onClick={() => setTab('market')}><Ic icon={Store} tone="green" /><div className="t">Рынок</div><div className="s">Покупай и продавай машины игрокам</div></button>
          <button className="tile bp press" onClick={() => push({ name: 'bp' })}>
            <Ic icon={Trophy} tone="gold" /><div className="t">Battle Pass</div>
            <div className="s">{bp ? `Уровень ${bp.level} из ${bp.levels.length}` : 'Награды за уровни'}</div>
            <div className="bar blue"><i style={{ width: `${bpPct}%` }} /></div>
          </button>
          <button className="tile garage press" onClick={() => push({ name: 'garage' })}><Ic icon={CarFront} tone="gold" /><div className="t">Гараж</div><div className="s">{me.garage.owned} из {me.garage.capacity} · {money(me.garage.value)}</div></button>
        </div>

        <Sect>Цены контейнеров</Sect>
        <div className="card list">
          {prices?.map((c) => (
            <Li key={c.id} lead={<ContainerArt c={c} size={30} />} title={c.name} sub={`старт ${money(c.price)}`} onClick={() => push({ name: 'catalog', id: c.id })} chev={false}
              right={<div className="col" style={{ alignItems: 'flex-end' }}><Spark data={c.history.length > 1 ? c.history : [c.base_price, c.price]} up={c.change >= 0} /><Delta v={c.change} /></div>} />
          )) ?? <Li title="Загрузка…" />}
        </div>
        <div className="xs faint">Цена меняется после каждого контейнера: дорогие торги поднимают её, контейнеры без ставок — снижают.</div>

        {!me.user.is_vip && (
          <button className="card gold press" onClick={() => push({ name: 'shop' })}>
            <div className="row"><Ic icon={Crown} tone="gold" /><div className="grow"><div className="h3">VIP навсегда</div><div className="sm muted">+10 мест, ниже комиссии, бонус ×2</div></div><ChevronRight size={18} className="faint" /></div>
          </button>
        )}

        <Sect action="Все" onAction={() => push({ name: 'leaders' })}>Самые богатые</Sect>
        <div className="card list">
          {top?.map((u, i) => <Li key={u.id} lead={<span className="b" style={{ width: 24, textAlign: 'center' }}>{['🥇', '🥈', '🥉'][i]}</span>} title={<Nick u={u} />} right={<b className="num">{money(u.value)}</b>} />) ?? <Li title="Загрузка…" />}
        </div>
      </div>
    </>
  );
}
