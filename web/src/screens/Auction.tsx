import { useCallback, useEffect, useRef, useState } from 'react';
import { call, clientId, errorText, haptic, toast } from '../tg';
import { money, who, RARITY } from '../format';
import { Avatar, CarArt, ContainerArt, RarityTag, Sheet, Money } from '../components';

// Аукцион вживую: опрос раз в секунду. Те же данные видит бот — ставка здесь сразу
// появляется в сообщении комнаты в Telegram, и наоборот.
export function Auction({ me, scope, balance, onBalance, onOpenGarage }: { me: any; scope: string | null; balance: number; onBalance: () => void; onOpenGarage: () => void }) {
  const [room, setRoom] = useState<any>(undefined);
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState(false);
  const [amount, setAmount] = useState('');
  const [catalog, setCatalog] = useState<any>(null);
  const offset = useRef(0);
  const lastAuction = useRef<number | null>(null);
  const [reveal, setReveal] = useState<any>(null);
  const [, force] = useState(0);

  const apply = useCallback((r: any) => {
    if (r?.room) offset.current = r.room.now - Date.now() / 1000;
    setRoom(r?.room ?? null);
    const a = r?.room?.auction;
    if (a && a.status !== 'active' && lastAuction.current === a.id) {
      setReveal(a); lastAuction.current = null; onBalance();
      if (a.status === 'won' && a.leader?.id === me?.id) haptic('success');
    }
    if (a?.status === 'active') lastAuction.current = a.id;
  }, [me?.id, onBalance]);

  const load = useCallback(() => call('app_room', { action: 'state', scope, roomId: room?.id ?? undefined }).then(apply, () => {}), [scope, room?.id, apply]);

  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 1000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => { const t = setInterval(() => force((x) => x + 1), 200); return () => clearInterval(t); }, []);
  useEffect(() => { if (room === null && !catalog) call('app_shop', { action: 'catalog' }).then(setCatalog, () => {}); }, [room, catalog]);

  const act = async (input: any, ok?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await call('app_room', { scope, roomId: room?.id, clientId: clientId(), ...input });
      apply(r); haptic('light'); onBalance();
      if (ok) toast(ok);
    } catch (e) { haptic('error'); toast(errorText(e)); }
    setBusy(false);
  };

  if (room === undefined) return <div className="center hint">Загрузка…</div>;

  if (!room) {
    return (
      <div className="page">
        <div className="hero glass">
          <div className="hero-ship">🚢</div>
          <h1>Аукцион контейнеров</h1>
          <p className="hint">Делай ставки — таймер запускается заново после каждой. Кто поставил последним, забирает контейнер. Внутри — случайная машина.</p>
          <button className="btn primary big" disabled={busy} onClick={() => act({ action: 'join' }, 'Ты в комнате!')}>🎮 Войти в комнату</button>
          {scope && <div className="hint small">Комната группы</div>}
        </div>
        {catalog && (
          <div className="section">
            <h3>Что может выпасть</h3>
            {catalog.containers.map((c: any) => (
              <div key={c.id} className="glass row-card">
                <ContainerArt c={c} size={44} />
                <div className="grow">
                  <b>{c.name}</b>
                  <div className="hint small">старт {money(c.price)}</div>
                  <Chances ch={c.chances} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const a = room.auction;
  const now = Date.now() / 1000 + offset.current;
  const left = a?.status === 'active' ? Math.max(0, a.ends_at - now) : 0;
  const pct = a?.status === 'active' ? Math.min(1, left / room.timer) : 0;
  const iLead = a?.leader?.id === me?.id;
  const nextIn = Math.max(0, Math.ceil(room.next_at - now));

  return (
    <div className="page auction">
      <div className="room-head">
        <div>
          <b>Комната №{room.number}</b>
          <span className="hint small"> · {room.count}/{room.max}</span>
        </div>
        <div className="avas">{room.members.slice(0, 7).map((m: any) => <Avatar key={m.id} u={m} size={26} />)}{room.count > 7 && <span className="more">+{room.count - 7}</span>}</div>
        {room.in_room
          ? <button className="btn ghost small" onClick={() => act({ action: 'leave' }, 'Ты вышел из комнаты')}>Выйти</button>
          : <button className="btn primary small" onClick={() => act({ action: 'join' })}>Войти</button>}
      </div>

      {a?.status === 'active' ? (
        <div className={`lot glass${left < 6 ? ' hot' : ''}`}>
          <div className="lot-top">
            <ContainerArt c={a.container} size={56} />
            <div className="grow">
              <div className="lot-name">{a.container.name}</div>
              <Chances ch={a.chances} />
            </div>
          </div>
          <div className="lot-mid">
            <Ring pct={pct} left={left} hot={left < 6} />
            <div className="lot-bid">
              <div className="hint small">{a.leader ? 'Текущая ставка' : 'Стартовая цена'}</div>
              <Money value={a.current} className="bid-num" />
              {a.leader ? (
                <div className={`leader${iLead ? ' me' : ''}`}><Avatar u={a.leader} size={22} /> {iLead ? 'Ты лидер!' : who(a.leader)}</div>
              ) : <div className="hint small">Ставок пока нет</div>}
            </div>
          </div>
          {room.in_room ? (
            <>
              <div className="bid-btns">
                {[room.step, 1000, 5000].filter((x, i, arr) => arr.indexOf(x) === i).map((x: number) => (
                  <button key={x} className="btn bid" disabled={busy} onClick={() => act({ action: 'bid', raise: x })}>+{money(x)}</button>
                ))}
                <button className="btn ghost" onClick={() => { setAmount(String(a.min_bid)); setCustom(true); }}>Своя</button>
              </div>
              <div className="hint small center-text">Баланс {money(balance)} · следующая ставка от {money(a.min_bid)}
                {room.my_missed > 0 && <> · без ставок: {room.my_missed} из {room.kick_after}</>}</div>
            </>
          ) : <button className="btn primary wide" onClick={() => act({ action: 'join' })}>Войти и торговаться</button>}
        </div>
      ) : (
        <div className="lot glass waiting">
          {a?.status === 'won' && a.car ? (
            <ResultCard a={a} me={me} />
          ) : a ? <div className="hint">📦 {a.container.name} — без ставок</div> : <div className="hint">Ждём игроков…</div>}
          {room.status === 'open'
            ? <div className="next">⏸ Следующий контейнер через <b>{nextIn}</b> с</div>
            : <div className="next">Комната закрыта</div>}
        </div>
      )}

      {a?.bids?.length > 0 && (
        <div className="section">
          <h3>Ставки</h3>
          <div className="glass feed">
            {a.bids.map((b: any, i: number) => (
              <div key={i} className={`feed-row${i === 0 ? ' top' : ''}`}>
                <span>{b.user_id === me?.id ? 'Ты' : who(b)}</span><b>{money(b.amount)}</b>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="hint small center-text">Играть можно и в чате с ботом — это та же комната.</p>

      <Sheet open={custom} onClose={() => setCustom(false)} title="Своя ставка">
        <input className="field big" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} />
        <div className="hint small">Минимум {money(a?.min_bid)} · баланс {money(balance)}</div>
        <button className="btn primary wide" disabled={busy} onClick={async () => { setCustom(false); await act({ action: 'bid', amount: Number(amount) }); }}>Поставить {money(Number(amount) || 0)}</button>
      </Sheet>

      <Sheet open={!!reveal && reveal.status === 'won' && reveal.leader?.id === me?.id} onClose={() => setReveal(null)}>
        {reveal?.car && (
          <div className={`reveal r-${reveal.car.rarity}`}>
            <div className="reveal-glow" />
            <div className="hint">Контейнер твой за {money(reveal.current)}!</div>
            <CarArt car={reveal.car} height={110} />
            <h2>{reveal.car.name}</h2>
            <RarityTag r={reveal.car.rarity} />
            <div className="reveal-price">Стоимость {money(reveal.car.price)}</div>
            {reveal.car.auto_sold != null
              ? <div className="hint">Гараж полон — машина продана за {money(reveal.car.auto_sold)}</div>
              : <button className="btn primary wide" onClick={() => { setReveal(null); onOpenGarage(); }}>🚗 В гараж</button>}
          </div>
        )}
      </Sheet>
    </div>
  );
}

function ResultCard({ a, me }: { a: any; me: any }) {
  const r = RARITY[a.car.rarity] ?? RARITY.common;
  return (
    <div className={`result r-${a.car.rarity}`}>
      <div className="hint small">🏆 {a.leader?.id === me?.id ? 'Ты забрал' : who(a.leader) + ' забирает'} за {money(a.current)}</div>
      <CarArt car={a.car} height={76} />
      <b>{r.icon} {a.car.name}</b>
      <div className="hint small">{r.name} · {money(a.car.price)}</div>
    </div>
  );
}

export function Chances({ ch }: { ch: any }) {
  const total = ['common', 'rare', 'epic', 'mythic'].reduce((s, r) => s + (ch?.[r] ?? 0), 0) || 1;
  return (
    <div className="chances">
      <div className="chance-bar">
        {['common', 'rare', 'epic', 'mythic'].map((r) => <i key={r} className={`r-${r}`} style={{ width: `${((ch?.[r] ?? 0) / total) * 100}%` }} />)}
      </div>
      <div className="chance-legend">
        {['common', 'rare', 'epic', 'mythic'].map((r) => <span key={r}>{RARITY[r].icon} {Math.round(((ch?.[r] ?? 0) / total) * 1000) / 10}%</span>)}
      </div>
    </div>
  );
}

function Ring({ pct, left, hot }: { pct: number; left: number; hot: boolean }) {
  const R = 34, C = 2 * Math.PI * R;
  return (
    <svg className={`ring${hot ? ' hot' : ''}`} viewBox="0 0 80 80">
      <circle cx="40" cy="40" r={R} className="ring-bg" />
      <circle cx="40" cy="40" r={R} className="ring-fg" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} />
      <text x="40" y="46" textAnchor="middle">{Math.ceil(left)}</text>
    </svg>
  );
}
