import { useCallback, useEffect, useRef, useState } from 'react';
import { Gavel, LogOut, Users, Pencil, Info, Package } from 'lucide-react';
import { call, clientId, errorText, haptic, toast } from '../tg';
import { money, who, RARITY } from '../format';
import { Avatar, CarArt, ContainerArt, RarityTag, Sheet, Money } from '../components';
import { Card, Badge, SectionTitle, ListRow, ScreenHead } from '../ui';
import { useApp } from '../App';

// Аукцион вживую: опрос раз в секунду. Те же данные видит бот — ставка здесь сразу
// появляется в сообщении комнаты в Telegram, и наоборот.
export function Auction() {
  const { me, reload, setTab, push, scope } = useApp();
  const [room, setRoom] = useState<any>(undefined);
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState(false);
  const [amount, setAmount] = useState('');
  const [catalog, setCatalog] = useState<any>(null);
  const [reveal, setReveal] = useState<any>(null);
  const offset = useRef(0);
  const lastAuction = useRef<number | null>(null);
  const [, force] = useState(0);
  const uid = me.user.id;

  const apply = useCallback((r: any) => {
    if (r?.room) offset.current = r.room.now - Date.now() / 1000;
    setRoom(r?.room ?? null);
    const a = r?.room?.auction;
    if (a && a.status !== 'active' && lastAuction.current === a.id) {
      lastAuction.current = null; reload();
      if (a.status === 'won' && a.leader?.id === uid) { setReveal(a); haptic('success'); }
    }
    if (a?.status === 'active') lastAuction.current = a.id;
  }, [uid, reload]);

  const load = useCallback(() => call('app_room', { action: 'state', scope, roomId: room?.id ?? undefined }).then(apply, () => {}), [scope, room?.id, apply]);
  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 1000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => { const t = setInterval(() => force((x) => x + 1), 250); return () => clearInterval(t); }, []);
  useEffect(() => { if (!catalog) call('app_shop', { action: 'catalog' }).then(setCatalog, () => {}); }, [catalog]);

  const act = async (input: any, ok?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await call('app_room', { scope, roomId: room?.id, clientId: clientId(), ...input });
      apply(r); haptic('light'); reload();
      if (ok) toast(ok);
    } catch (e) { haptic('error'); toast(errorText(e)); }
    setBusy(false);
  };

  if (room === undefined) return <div className="screen"><ScreenHead brand="Аукцион" title="Загрузка…" /></div>;

  if (!room || (!room.in_room && room.status === 'closed')) {
    const c = catalog?.containers?.[0];
    return (
      <div className="screen">
        <ScreenHead brand="Аукцион" title="Контейнеры с машинами" />
        <Card>
          {c && <div className="lot-hero"><ContainerArt c={c} size={150} studio /></div>}
          <div className="t-title-l">Как играть</div>
          <ListRow icon={Gavel} title="Ставь выше других" subtitle="После каждой ставки таймер 30 секунд запускается заново" />
          <ListRow icon={Package} tone="rose" title="Последняя ставка забирает контейнер" subtitle="Внутри — случайная машина одной из четырёх редкостей" />
          <ListRow icon={Info} tone="teal" title="Перебили — деньги вернутся" subtitle="Ставка списывается сразу и возвращается, если тебя обошли" />
          <button className="btn primary l block" disabled={busy} onClick={() => act({ action: 'join' }, 'Ты в комнате!')}>Войти в комнату</button>
          {scope && <div className="t-small muted center-text">Комната этой группы</div>}
        </Card>
        {catalog && (
          <>
            <SectionTitle>Что может выпасть</SectionTitle>
            <Card className="tight">
              {catalog.containers.map((x: any) => (
                <ListRow key={x.id} leading={<ContainerArt c={x} size={34} />} title={x.name}
                  subtitle={<><span>старт {money(x.price)}</span><Chances ch={x.chances} compact /></>} onClick={() => push({ name: 'catalog', id: x.id })} />
              ))}
            </Card>
          </>
        )}
      </div>
    );
  }

  const a = room.auction;
  const now = Date.now() / 1000 + offset.current;
  const left = a?.status === 'active' ? Math.max(0, a.ends_at - now) : 0;
  const pct = a?.status === 'active' ? Math.min(1, left / room.timer) : 0;
  const iLead = a?.leader?.id === uid;
  const nextIn = Math.max(0, Math.ceil(room.next_at - now));
  const steps = [room.step, 1000, 5000].filter((x, i, arr) => arr.indexOf(x) === i);

  return (
    <div className="screen">
      <ScreenHead brand="Аукцион" title={`Комната №${room.number}`}
        trailing={<div className="avas">{room.members.slice(0, 4).map((m: any) => <Avatar key={m.id} u={m} size={30} />)}</div>} />

      {a?.status === 'active' ? (
        <Card className={left < 6 ? 'hot' : ''}>
          <div className="lot-hero">
            <ContainerArt c={a.container} size={150} studio />
            <span className="live"><i /> Идут торги · {room.count} игроков</span>
          </div>
          <div className="t-title-l">{a.container.name}</div>
          <Chances ch={a.chances} />
          <div className="row" style={{ gap: 16 }}>
            <Ring pct={pct} left={left} hot={left < 6} />
            <div className="grow">
              <div className="t-small muted">{a.leader ? 'Текущая ставка' : 'Стартовая цена'}</div>
              <Money value={a.current} className="bid-num" />
              {a.leader
                ? <div className={`leader${iLead ? ' me' : ''}`}><Avatar u={a.leader} size={22} /> {iLead ? 'Ты лидер' : who(a.leader)}</div>
                : <div className="t-small muted">Ставок пока нет</div>}
            </div>
          </div>
          {room.in_room ? (
            <>
              <div className="bid-grid">
                {steps.map((x: number) => <button key={x} className="bid-btn" disabled={busy} onClick={() => act({ action: 'bid', raise: x })}>+{money(x)}</button>)}
              </div>
              <button className="btn tonal block" onClick={() => { setAmount(String(a.min_bid)); setCustom(true); }}><Pencil size={16} /> Своя ставка</button>
              <div className="t-small muted center-text">Баланс {money(me.balance)} · минимум {money(a.min_bid)}
                {room.my_missed > 0 && <> · без ставок {room.my_missed} из {room.kick_after}</>}</div>
            </>
          ) : <button className="btn primary l block" onClick={() => act({ action: 'join' })}>Войти и торговаться</button>}
        </Card>
      ) : (
        <Card>
          {a?.status === 'won' && a.car ? (
            <div className={`reveal r-${a.car.rarity}`}>
              <div className="reveal-art"><CarArt car={a.car} height={150} studio /></div>
              <div className="t-small muted">{a.leader?.id === uid ? 'Ты забрал' : `${who(a.leader)} забирает`} за {money(a.current)}</div>
              <div className="t-title-l">{a.car.name}</div>
              <div className="row gap-8"><RarityTag r={a.car.rarity} /><span className="t-small muted">стоимость {money(a.car.price)}</span></div>
            </div>
          ) : <ListRow icon={Package} title={a ? `${a.container.name} — без ставок` : 'Ждём игроков'} subtitle="Контейнер ушёл без торгов" />}
          <div className="divider" />
          <div className="t-body muted center-text">{room.status === 'open' ? <>Следующий контейнер через <b className="accent">{nextIn} с</b></> : 'Комната закрыта'}</div>
        </Card>
      )}

      {a?.bids?.length > 0 && (
        <>
          <SectionTitle>Ставки</SectionTitle>
          <Card className="tight">
            {a.bids.map((b: any, i: number) => (
              <div key={i} className={`feed-row${i === 0 ? ' top' : ''}`}>
                <span className="grow">{b.user_id === uid ? 'Ты' : who(b)}</span><b>{money(b.amount)}</b>
              </div>
            ))}
          </Card>
        </>
      )}

      <Card className="tight">
        <ListRow icon={Users} tone="teal" title={`Игроков в комнате: ${room.count} из ${room.max}`} subtitle="Играть можно и в чате с ботом — это та же комната" />
        {room.in_room && <ListRow icon={LogOut} tone="rose" title="Выйти из комнаты" onClick={() => act({ action: 'leave' }, 'Ты вышел из комнаты')} />}
      </Card>

      <Sheet open={custom} onClose={() => setCustom(false)} title="Своя ставка">
        <input className="field big" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} />
        <div className="t-small muted center-text">Минимум {money(a?.min_bid)} · баланс {money(me.balance)}</div>
        <button className="btn primary l block" disabled={busy} onClick={async () => { setCustom(false); await act({ action: 'bid', amount: Number(amount) }); }}>Поставить {money(Number(amount) || 0)}</button>
      </Sheet>

      <Sheet open={!!reveal} onClose={() => setReveal(null)}>
        {reveal?.car && (
          <div className={`reveal r-${reveal.car.rarity}`}>
            <div className="t-small muted">Контейнер твой за {money(reveal.current)}</div>
            <div className="reveal-art"><CarArt car={reveal.car} height={170} studio /></div>
            <div className="t-headline-s">{reveal.car.name}</div>
            <RarityTag r={reveal.car.rarity} />
            <div className="t-title">Стоимость {money(reveal.car.price)}</div>
            {reveal.car.auto_sold != null
              ? <div className="t-body muted">Гараж полон — машина сразу продана за {money(reveal.car.auto_sold)}</div>
              : <button className="btn primary l block" onClick={() => { setReveal(null); if (reveal.car.user_car_id) push({ name: 'car', id: reveal.car.user_car_id }); else setTab('garage'); }}>Открыть машину</button>}
          </div>
        )}
      </Sheet>
    </div>
  );
}

export function Chances({ ch, compact = false }: { ch: any; compact?: boolean }) {
  const R = ['common', 'rare', 'epic', 'mythic'];
  const total = R.reduce((s, r) => s + (ch?.[r] ?? 0), 0) || 1;
  return (
    <div className="col" style={{ gap: 6, marginTop: compact ? 4 : 0 }}>
      <div className="chance-bar">{R.map((r) => <i key={r} className={`r-${r}`} style={{ width: `${((ch?.[r] ?? 0) / total) * 100}%` }} />)}</div>
      {!compact && <div className="chance-legend">{R.map((r) => <span key={r} className={`r-${r}`}><b />{RARITY[r].name} {Math.round(((ch?.[r] ?? 0) / total) * 1000) / 10}%</span>)}</div>}
    </div>
  );
}

function Ring({ pct, left, hot }: { pct: number; left: number; hot: boolean }) {
  const R = 34, C = 2 * Math.PI * R;
  return (
    <svg className={`ring${hot ? ' hot' : ''}`} viewBox="0 0 80 80">
      <circle cx="40" cy="40" r={R} className="ring-bg" />
      <circle cx="40" cy="40" r={R} className="ring-fg" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} />
      <text x="40" y="47" textAnchor="middle">{Math.ceil(left)}</text>
    </svg>
  );
}

void Badge;
