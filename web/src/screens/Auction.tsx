import { useCallback, useEffect, useRef, useState } from 'react';
import { Gavel, LogOut, Users, Pencil, Package, RotateCcw } from 'lucide-react';
import { call, clientId, errorText, haptic, toast } from '../tg';
import { money, RARITY } from '../format';
import { Avatar, CarArt, ContainerArt, RarityTag, Sheet, Money } from '../components';
import { ContainerScene, TIMING } from '../Unboxing';
import { fx } from '../sound';
import { AppBar, Sect, Li, Nick } from '../ui';
import { useApp } from '../App';
import { t } from '../i18n';

// Аукцион вживую: опрос раз в секунду. Те же данные видит бот — ставка здесь сразу
// появляется в сообщении комнаты в Telegram, и наоборот.
export function Auction() {
  const { me, reload, push, scope } = useApp();
  const [room, setRoom] = useState<any>(undefined);
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState(false);
  const [amount, setAmount] = useState('');
  const [catalog, setCatalog] = useState<any>(null);
  const [anim, setAnim] = useState<{ id: number; t0: number } | null>(null);
  const lastLeader = useRef<number | null>(null);
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
      // торги закончились у нас на глазах — открываем этот же контейнер: дрожь → двери → машина
      last.current = null; reload();
      setAnim({ id: a.id, t0: Date.now() });
      const rr = a.car?.rarity ?? 'common', [sh, turn, open] = TIMING[rr] ?? TIMING.common;
      fx.rumble(rr);
      setTimeout(() => fx.doors(), sh + turn);
      setTimeout(() => { fx.reveal(rr); if (a.status === 'won' && a.leader?.id === uid) haptic('success'); }, sh + turn + open * 0.6);
    }
    if (a?.status === 'active') {
      // перебили — коротко сообщить
      if (last.current === a.id && lastLeader.current === uid && a.leader?.id !== uid) { haptic('heavy'); toast(t('Тебя перебили!')); }
      last.current = a.id; lastLeader.current = a.leader?.id ?? null;
    }
  }, [uid, reload]);

  const load = useCallback(() => call('app_room', { action: 'state', scope, roomId: room?.id ?? undefined }).then(apply, () => {}), [scope, room?.id, apply]);
  useEffect(() => {
    load();
    const iv = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 1000);
    return () => clearInterval(iv);
  }, [load]);
  useEffect(() => { const iv = setInterval(() => force((x) => x + 1), 250); return () => clearInterval(iv); }, []);
  useEffect(() => { if (!catalog) call('app_shop', { action: 'catalog' }).then(setCatalog, () => {}); }, [catalog]);

  const act = async (input: any, ok?: string) => {
    if (busy) return;
    setBusy(true);
    try { const r = await call('app_room', { scope, roomId: room?.id, clientId: clientId(), ...input }); apply(r); haptic('light'); reload(); if (ok) toast(ok); }
    catch (e) { haptic('error'); toast(errorText(e)); }
    setBusy(false);
  };

  if (room === undefined) return <><AppBar title={t('Аукцион')} /><div className="page" /></>;

  if (!room || (!room.in_room && room.status === 'closed')) {
    return (
      <>
        <AppBar title={t('Аукцион')} />
        <div className="page">
          <div className="card pad0">
            <div className="hero-img"><ContainerArt c={catalog?.containers?.[0] ?? { id: 1, country: t('Япония') }} size={150} studio /></div>
            <div className="col g12" style={{ padding: 14 }}>
              <div className="h2">{t('Торгуйся за контейнеры')}</div>
              <Li icon={Gavel} title={t('Ставь выше других')} sub={t('После каждой ставки 30 секунд таймера начинаются заново')} />
              <Li icon={Package} tone="gold" title={t('Последняя ставка — твой контейнер')} sub={t('Внутри случайная машина одной из четырёх редкостей')} />
              <Li icon={RotateCcw} tone="blue" title={t('Перебили — деньги вернутся')} sub={t('Ставка списывается сразу и возвращается, если тебя обошли')} />
              <button className="btn go xl w" disabled={busy} onClick={() => act({ action: 'join' }, t('Ты в комнате'))}>{t('Войти в комнату')}</button>
              {scope && <div className="xs muted center">{t('Комната этой группы')}</div>}
            </div>
          </div>
          {catalog && (
            <>
              <Sect>{t('Что может выпасть')}</Sect>
              <div className="card list">
                {catalog.containers.map((x: any) => (
                  <Li key={x.id} lead={<ContainerArt c={x} size={30} />} title={t(x.name)} sub={<Chances ch={x.chances} compact />} onClick={() => push({ name: 'catalog', id: x.id })} />
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
  const car = a?.car ?? null;
  const rar = car?.rarity ?? 'common';
  // фаза сцены: торги → дрожь → двери открываются → итог (кто зашёл позже — сразу итог)
  const tm = TIMING[rar] ?? TIMING.common;
  let phase: 'live' | 'shake' | 'open' | 'done' = a?.status === 'active' ? 'live' : 'done';
  let uph = a?.status === 'active' ? 0 : 4;
  if (a && a.status !== 'active' && anim?.id === a.id && car) {
    const el = Date.now() - (anim?.t0 ?? 0);
    uph = el < tm[0] ? 0 : el < tm[0] + tm[1] ? 1 : el < tm[0] + tm[1] + tm[2] * 0.6 ? 2 : el < tm[0] + tm[1] + tm[2] + tm[3] ? 3 : 4;
    phase = uph === 0 ? 'shake' : uph < 4 ? 'open' : 'done';
  }
  const iBid = !!a?.bids?.some((b: any) => b.user_id === uid);
  const lastChance = room.in_room && !iBid && room.my_missed >= room.kick_after - 1;

  return (
    <>
      <AppBar title={t('Комната №{n}', { n: room.number })} />
      <div className="page">
        {room.kicked && !room.in_room && (
          <div className="card kick-card">
            <div className="h3">{t('Тебя выкинуло из комнаты')}</div>
            <div className="sm muted">{t('{n} контейнера подряд без ставки. Смотреть можно, а чтобы торговаться — вернись.', { n: room.kick_after })}</div>
            <button className="btn go w" disabled={busy} onClick={() => act({ action: 'join' }, t('Ты снова в комнате'))}>{t('Вернуться в комнату')}</button>
          </div>
        )}

        {a ? (
          <div className={`card pad0${phase === 'live' && left < 6 ? ' hot' : ''}`}>
            <div className={`unbox inline r-${phase === 'live' ? 'common' : rar} ph-${uph}${phase === 'live' ? ' idle' : ''}${phase === 'live' && left < 6 ? ' hot' : ''}`}
              style={{ ['--turn' as any]: `${tm[1]}ms`, ['--open' as any]: `${tm[2]}ms`, ['--shake' as any]: `${tm[0]}ms` }}>
              <ContainerScene container={a.container} car={phase === 'live' ? null : car} r={phase === 'live' ? 'common' : rar} />
              <span className="st-tag">
                {phase === 'live' ? <><span className="live-dot" /> {t('Торги · игроков: {n}', { n: room.count })}</>
                  : phase !== 'done' ? t('Открываем контейнер…')
                  : a.status === 'won' ? (iLead ? t('Контейнер твой!') : t('Продан')) : t('Без ставок')}
              </span>
              {phase === 'live' && <span className={`st-timer${left < 6 ? ' hot' : ''}`}>{Math.ceil(left)}</span>}
            </div>

            {phase === 'live' ? (
              <div className="col g12" style={{ padding: 14 }}>
                <div className="row between g8"><div className="h3">{t(a.container.name)}</div><span className="sm muted">{t('ставок: {n}', { n: a.bids_count ?? a.bids.length })}</span></div>
                <Chances ch={a.chances} compact />
                <div className="row g12">
                  <Timer pct={pct} left={left} hot={left < 6} />
                  <div className="grow col">
                    <span className="sm muted">{a.leader ? t('Текущая ставка') : t('Стартовая цена')}</span>
                    <span key={a.current} className="bump"><Money value={a.current} className="bid-num" /></span>
                    {a.leader ? <div className="row g6">{iLead ? <span className="lead-me">{t('★ Ты лидер')}</span> : <><span className="sm muted">{t('лидер')}</span><Nick u={a.leader} /></>}</div>
                      : <span className="sm muted">{t('Ставок пока нет — начни первым')}</span>}
                  </div>
                </div>
                {room.in_room ? (
                  <>
                    <div className="grid3">{steps.map((x: number) => <button key={x} className="bid-btn" disabled={busy || iLead} onClick={() => act({ action: 'bid', raise: x })}>+{money(x)}</button>)}</div>
                    <button className="btn w" disabled={iLead} onClick={() => { setAmount(String(a.min_bid)); setCustom(true); }}><Pencil size={16} /> {t('Своя сумма')}</button>
                    <div className={`misses${lastChance ? ' warn' : ''}`}>
                      <span className="dots">{Array.from({ length: room.kick_after }, (_, i) => <i key={i} className={i < room.my_missed ? 'on' : ''} />)}</span>
                      <span>{iBid ? t('Ставка в этом контейнере сделана — пропуск не засчитан')
                        : lastChance ? t('Последний шанс: без ставки в этом контейнере тебя выкинет из комнаты')
                        : t('Пропуски: {a} из {b}. {b} контейнера подряд без ставки — выход из комнаты', { a: room.my_missed, b: room.kick_after })}</span>
                    </div>
                    <div className="xs muted center">{t('Баланс {a} · минимум {b}', { a: money(me.balance), b: money(a.min_bid) })}</div>
                  </>
                ) : <button className="btn go xl w" onClick={() => act({ action: 'join' })}>{t('Войти и торговаться')}</button>}
              </div>
            ) : (
              <div className="col g12" style={{ padding: 14 }}>
                {phase !== 'done' ? <div className="center sm muted">{t('Открываем {c}…', { c: t(a.container.name) })}</div> : car ? (
                  <div className={`result r-${rar}`}>
                    <div className="sm muted">
                      {a.status === 'won' ? (iLead ? t('Ты забрал за {m}', { m: money(a.current) }) : <span className="row g6"><Nick u={a.leader} /> {t('забирает за {m}', { m: money(a.current) })}</span>)
                        : t('Никто не сделал ставку. Внутри было:')}
                    </div>
                    <div className="h2">{car.name}</div>
                    <div className="row g8"><RarityTag r={rar} /><span className="sm muted">{t('стоимость {m}', { m: money(car.price) })}</span></div>
                    {a.status === 'won' && iLead && (car.auto_sold != null
                      ? <div className="sm muted">{t('Гараж полон — машина сразу продана за {m}', { m: money(car.auto_sold) })}</div>
                      : <button className="btn go w" onClick={() => { push({ name: 'garage' }); if (car.user_car_id) push({ name: 'car', id: car.user_car_id }); }}>{t('Открыть машину')}</button>)}
                  </div>
                ) : <Li icon={Package} title={t('{c} — без ставок', { c: t(a.container.name) })} />}
                {phase === 'done' && (room.status === 'open' ? (
                  <div className="next">
                    <div className="row between"><span className="sm muted">{t('Следующий контейнер')}</span><b className="c-orange">{t('через {n} с', { n: nextIn })}</b></div>
                    <div className="bar"><i style={{ width: `${Math.max(0, Math.min(100, 100 - (nextIn / (room.next_delay ?? 9)) * 100))}%` }} /></div>
                  </div>
                ) : <div className="center sm muted">{t('Комната закрыта')}</div>)}
              </div>
            )}
          </div>
        ) : <div className="card"><Li icon={Package} title={t('Ждём игроков')} sub={t('Контейнер появится, как только в комнате будет хоть один игрок')} /></div>}

        {a?.bids?.length > 0 && (
          <>
            <Sect>{t('Ставки')}</Sect>
            <div className="card list feed">
              {a.bids.map((b: any, i: number) => <div key={`${b.user_id}:${b.amount}`} className={`fr${i === 0 ? ' fresh' : ''}${b.user_id === uid ? ' mine' : ''}`}><span className="grow"><Nick u={{ id: b.user_id, username: b.username, first_name: b.first_name }} /></span><b className="num">{money(b.amount)}</b></div>)}
            </div>
          </>
        )}

        <div className="card list">
          <Li icon={Users} tone="blue" title={t('Игроки: {a} из {b}', { a: room.count, b: room.max })} sub={t('Играть можно и в чате с ботом — это та же комната')} onClick={() => setPlayers(true)} />
          {room.in_room && <Li icon={LogOut} tone="red" title={t('Выйти из комнаты')} onClick={() => act({ action: 'leave' }, t('Ты вышел из комнаты'))} />}
        </div>
      </div>

      <Sheet open={players} onClose={() => setPlayers(false)} title={t('Игроки в комнате')}>
        <div className="card list">{room.members.map((m: any) => <Li key={m.id} lead={<Avatar u={m} size={34} />} title={<Nick u={m} noAva />} sub={m.missed ? t('пропусков: {n} из {k}', { n: m.missed, k: room.kick_after }) : t('активен')} />)}</div>
      </Sheet>

      <Sheet open={custom} onClose={() => setCustom(false)} title={t('Своя ставка')}>
        <input className="inp big" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} />
        <div className="sm muted center">{t('Минимум {a} · баланс {b}', { a: money(a?.min_bid), b: money(me.balance) })}</div>
        <button className="btn go xl w" disabled={busy} onClick={async () => { setCustom(false); await act({ action: 'bid', amount: Number(amount) }); }}>{t('Поставить {m}', { m: money(Number(amount) || 0) })}</button>
      </Sheet>
    </>
  );
}

export function Chances({ ch, compact = false }: { ch: any; compact?: boolean }) {
  const R = ['common', 'rare', 'epic', 'mythic', 'mystic'];
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
