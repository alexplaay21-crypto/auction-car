import { useCallback, useEffect, useRef, useState } from 'react';
import { Gavel, LogOut, Users, Pencil, Package, RotateCcw } from 'lucide-react';
import { call, clientId, errorText, haptic, toast } from '../tg';
import { money, RARITY } from '../format';
import { Avatar, CarArt, ContainerArt, RarityTag, Sheet, Money } from '../components';
import { AppBar, Sect, Li, Nick } from '../ui';
import { useApp } from '../App';

// Аукцион вживую: опрос раз в секунду. Те же данные видит бот — ставка здесь сразу
// появляется в сообщении комнаты в Telegram, и наоборот.
export function Auction() {
  const { me, reload, push, scope } = useApp();
  const [room, setRoom] = useState<any>(undefined);
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState(false);
  const [amount, setAmount] = useState('');
  const [catalog, setCatalog] = useState<any>(null);
  const [reveal, setReveal] = useState<any>(null);
  const [players, setPlayers] = useState(false);
  const offset = useRef(0);
  const last = useRef<number | null>(null);
  const [, force] = useState(0);
  const uid = me.user.id;

  const apply = useCallback((r: any) => {
    if (r?.room) offset.current = r.room.now - Date.now() / 1000;
    setRoom(r?.room ?? null);
    const a = r?.room?.auction;
    if (a && a.status !== 'active' && last.current === a.id) {
      last.current = null; reload();
      if (a.status === 'won' && a.leader?.id === uid) { setReveal(a); haptic('success'); }
    }
    if (a?.status === 'active') last.current = a.id;
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
    try { const r = await call('app_room', { scope, roomId: room?.id, clientId: clientId(), ...input }); apply(r); haptic('light'); reload(); if (ok) toast(ok); }
    catch (e) { haptic('error'); toast(errorText(e)); }
    setBusy(false);
  };

  if (room === undefined) return <><AppBar title="Аукцион" /><div className="page" /></>;

  if (!room || (!room.in_room && room.status === 'closed')) {
    return (
      <>
        <AppBar title="Аукцион" />
        <div className="page">
          <div className="card pad0">
            <div className="hero-img"><ContainerArt c={catalog?.containers?.[0] ?? { id: 1, country: 'Япония' }} size={150} studio /></div>
            <div className="col g12" style={{ padding: 14 }}>
              <div className="h2">Торгуйся за контейнеры</div>
              <Li icon={Gavel} title="Ставь выше других" sub="После каждой ставки 30 секунд таймера начинаются заново" />
              <Li icon={Package} tone="gold" title="Последняя ставка — твой контейнер" sub="Внутри случайная машина одной из четырёх редкостей" />
              <Li icon={RotateCcw} tone="blue" title="Перебили — деньги вернутся" sub="Ставка списывается сразу и возвращается, если тебя обошли" />
              <button className="btn go xl w" disabled={busy} onClick={() => act({ action: 'join' }, 'Ты в комнате')}>Войти в комнату</button>
              {scope && <div className="xs muted center">Комната этой группы</div>}
            </div>
          </div>
          {catalog && (
            <>
              <Sect>Что может выпасть</Sect>
              <div className="card list">
                {catalog.containers.map((x: any) => (
                  <Li key={x.id} lead={<ContainerArt c={x} size={30} />} title={x.name} sub={<><span>старт {money(x.price)}</span><Chances ch={x.chances} compact /></>} onClick={() => push({ name: 'catalog', id: x.id })} />
                ))}
              </div>
            </>
          )}
        </div>
      </>
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
    <>
      <AppBar title={`Комната №${room.number}`} />
      <div className="page">
        {a?.status === 'active' ? (
          <div className={`card pad0${left < 6 ? ' hot' : ''}`}>
            <div className="hero-img">
              <ContainerArt c={a.container} size={150} studio />
              <span className="tag"><span className="live-dot" /> Торги · {room.count} игроков</span>
            </div>
            <div className="col g12" style={{ padding: 14 }}>
              <div className="col"><div className="h2">{a.container.name}</div><span className="sm muted">стартовая цена {money(a.initial)} · меняется от торгов</span></div>
              <Chances ch={a.chances} />
              <div className="row g12">
                <Timer pct={pct} left={left} hot={left < 6} />
                <div className="grow col">
                  <span className="sm muted">{a.leader ? 'Текущая ставка' : 'Стартовая цена'}</span>
                  <Money value={a.current} className="bid-num" />
                  {a.leader ? <div className="row g6">{iLead ? <span className="b c-orange">Ты лидер</span> : <><span className="sm muted">лидер</span><Nick u={a.leader} /></>}</div>
                    : <span className="sm muted">Ставок пока нет</span>}
                </div>
              </div>
              {room.in_room ? (
                <>
                  <div className="grid3">{steps.map((x: number) => <button key={x} className="bid-btn" disabled={busy} onClick={() => act({ action: 'bid', raise: x })}>+{money(x)}</button>)}</div>
                  <button className="btn w" onClick={() => { setAmount(String(a.min_bid)); setCustom(true); }}><Pencil size={16} /> Своя сумма</button>
                  <div className="xs muted center">Баланс {money(me.balance)} · минимум {money(a.min_bid)}{room.my_missed > 0 && <> · пропущено {room.my_missed} из {room.kick_after}</>}</div>
                </>
              ) : <button className="btn go xl w" onClick={() => act({ action: 'join' })}>Войти и торговаться</button>}
            </div>
          </div>
        ) : (
          <div className="card">
            {a?.status === 'won' && a.car ? (
              <div className={`reveal r-${a.car.rarity}`}>
                <div className="reveal-art"><CarArt car={a.car} height={150} studio /></div>
                <div className="row g6 sm muted">{a.leader?.id === uid ? 'Ты забрал' : <><Nick u={a.leader} /> забирает</>} за {money(a.current)}</div>
                <div className="h2">{a.car.name}</div>
                <div className="row g8"><RarityTag r={a.car.rarity} /><span className="sm muted">стоимость {money(a.car.price)}</span></div>
              </div>
            ) : <Li icon={Package} title={a ? `${a.container.name} — без ставок` : 'Ждём игроков'} sub={a ? 'Цена такого контейнера немного снизится' : undefined} />}
            <div className="sep" />
            <div className="center">{room.status === 'open' ? <>Следующий контейнер через <b className="c-orange">{nextIn} с</b></> : 'Комната закрыта'}</div>
          </div>
        )}

        {a?.bids?.length > 0 && (
          <>
            <Sect>Ставки</Sect>
            <div className="card list feed">
              {a.bids.map((b: any, i: number) => <div key={i} className="fr"><span className="grow"><Nick u={{ id: b.user_id, username: b.username, first_name: b.first_name }} /></span><b className="num">{money(b.amount)}</b></div>)}
            </div>
          </>
        )}

        <div className="card list">
          <Li icon={Users} tone="blue" title={`Игроки: ${room.count} из ${room.max}`} sub="Играть можно и в чате с ботом — это та же комната" onClick={() => setPlayers(true)} />
          {room.in_room && <Li icon={LogOut} tone="red" title="Выйти из комнаты" onClick={() => act({ action: 'leave' }, 'Ты вышел из комнаты')} />}
        </div>
      </div>

      <Sheet open={players} onClose={() => setPlayers(false)} title="Игроки в комнате">
        <div className="card list">{room.members.map((m: any) => <Li key={m.id} lead={<Avatar u={m} size={34} />} title={<Nick u={m} noAva />} sub={m.missed ? `без ставок: ${m.missed}` : 'активен'} />)}</div>
      </Sheet>

      <Sheet open={custom} onClose={() => setCustom(false)} title="Своя ставка">
        <input className="inp big" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} />
        <div className="sm muted center">Минимум {money(a?.min_bid)} · баланс {money(me.balance)}</div>
        <button className="btn go xl w" disabled={busy} onClick={async () => { setCustom(false); await act({ action: 'bid', amount: Number(amount) }); }}>Поставить {money(Number(amount) || 0)}</button>
      </Sheet>

      <Sheet open={!!reveal} onClose={() => setReveal(null)}>
        {reveal?.car && (
          <div className={`reveal r-${reveal.car.rarity}`}>
            <div className="sm muted">Контейнер твой за {money(reveal.current)}</div>
            <div className="reveal-art"><CarArt car={reveal.car} height={170} studio /></div>
            <div className="h2">{reveal.car.name}</div>
            <RarityTag r={reveal.car.rarity} />
            <div className="h3">Стоимость {money(reveal.car.price)}</div>
            {reveal.car.auto_sold != null
              ? <div className="sm muted">Гараж полон — машина сразу продана за {money(reveal.car.auto_sold)}</div>
              : <button className="btn go xl w" onClick={() => { setReveal(null); push({ name: 'garage' }); if (reveal.car.user_car_id) push({ name: 'car', id: reveal.car.user_car_id }); }}>Открыть машину</button>}
          </div>
        )}
      </Sheet>
    </>
  );
}

export function Chances({ ch, compact = false }: { ch: any; compact?: boolean }) {
  const R = ['common', 'rare', 'epic', 'mythic'];
  const total = R.reduce((s, r) => s + (ch?.[r] ?? 0), 0) || 1;
  return (
    <div className="col g6" style={{ marginTop: compact ? 4 : 0 }}>
      <div className="chance-bar">{R.map((r) => <i key={r} className={`r-${r}`} style={{ width: `${((ch?.[r] ?? 0) / total) * 100}%` }} />)}</div>
      {!compact && <div className="legend">{R.map((r) => <span key={r} className={`r-${r}`}><b />{RARITY[r].name} {Math.round(((ch?.[r] ?? 0) / total) * 1000) / 10}%</span>)}</div>}
    </div>
  );
}

function Timer({ pct, left, hot }: { pct: number; left: number; hot: boolean }) {
  const R = 35, C = 2 * Math.PI * R;
  return (
    <svg className={`timer${hot ? ' hot' : ''}`} viewBox="0 0 86 86">
      <circle cx="43" cy="43" r={R} className="bg" />
      <circle cx="43" cy="43" r={R} className="fg" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} />
      <text x="43" y="51" textAnchor="middle">{Math.ceil(left)}</text>
    </svg>
  );
}
