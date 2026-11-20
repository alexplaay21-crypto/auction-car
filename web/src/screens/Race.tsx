import { useCallback, useEffect, useState } from 'react';
import { Flag, Swords, Timer as TimerIcon, Gauge, Trophy, X, Zap, RotateCw, Mountain, Minus, Plus, Play, Bot, RotateCcw } from 'lucide-react';
import { call, clientId, errorText, haptic, toast } from '../tg';
import { money } from '../format';
import { CarArt, Sheet } from '../components';
import { AppBar, Li, Nick, Seg, CarPicker, Ic, Empty } from '../ui';
import { useApp } from '../App';
import { t } from '../i18n';
import { Drive, fmtMs, type Side } from '../Drive';
import { fx } from '../sound';

const DNF = 999_999;
const sec = (ms: number | null | undefined) => (ms == null || ms >= DNF ? t('сход') : (ms / 1000).toFixed(2).replace('.', ',') + t(' с'));
const TRACKS: { id: string; name: string; icon: any; how: string; stats: string }[] = [
  { id: 'drag', name: 'Драг 402 м', icon: Zap, how: 'Обороты на старте, передачи в зелёной зоне, нитро', stats: 'разгон · мощность' },
  { id: 'circuit', name: 'Кольцо', icon: RotateCw, how: 'Руль, тормоз перед поворотом, обгоны дают нитро', stats: 'скорость · управление' },
  { id: 'rally', name: 'Ралли', icon: Mountain, how: 'Грунт скользит, объезжай камни', stats: 'управление · надёжность' },
];
const trackName = (id: string) => t(TRACKS.find((x) => x.id === id)?.name ?? id);

type Play = { drive: any; me: Side; rival: Side | null; params: any };

export function Race() {
  const { me, reload, push } = useApp();
  const [d, setD] = useState<any>(null);
  const [tab, setTab] = useState<'go' | 'pvp' | 'history'>('go');
  const [car, setCar] = useState<any>(null);
  const [track, setTrack] = useState('drag');
  const [stake, setStake] = useState(5000);
  const [busy, setBusy] = useState(false);
  const [accept, setAccept] = useState<any>(null);
  const [play, setPlay] = useState<Play | null>(null);
  const [res, setRes] = useState<any>(null);         // итог от сервера
  const [pending, setPending] = useState<any>(null); // нажатия, ждут отправки
  const [ask, setAsk] = useState(false);
  const [replay, setReplay] = useState<{ track: string; seed: number; me: Side; rival: Side | null; race: any; key: number } | null>(null);
  const [old, setOld] = useState<any>(null);

  const load = useCallback(() => call('app_race', {}).then(setD, (e) => toast(errorText(e))), []);
  useEffect(() => { load(); }, [load]);

  const label = (u: any) => String(u?.first_name || u?.username || t('Соперник')).slice(0, 14);
  const sideOf = (r: any): Side | null => !r ? null : r.kind === 'bot'
    ? { car: r.car, reaction: r.reaction, ai: r.a, label: t('Бот') }
    : { car: r.car, reaction: r.reaction, inputs: r.inputs, label: label(r.user) };

  const start = async (params: any) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await call('app_race', { action: 'start', clientId: clientId(), ...params });
      setRes(null); setPending(null); setAsk(false);
      setPlay({ drive: r.drive, me: { car: r.drive.car, reaction: r.drive.reaction, label: '' }, rival: sideOf(r.drive.rival), params });
      reload();
    } catch (e) { haptic('error'); toast(errorText(e)); }
    setBusy(false);
  };
  const send = async (p: { inputs: number[][]; ms: number }) => {
    setPending(p);
    try {
      const r = await call('app_race', { action: 'finish', driveId: play!.drive.id, inputs: p.inputs });
      setRes(r); setPending(null);
      const won = r.race?.winner_id === me.user.id;
      if (r.race?.status === 'done') (won ? fx.win() : fx.error());
      reload(); load();
    } catch (e) { toast(errorText(e)); }
  };
  const close = () => { setPlay(null); setRes(null); setPending(null); setAsk(false); load(); };
  const openReplay = async (r: any) => {
    try {
      const x = await call('app_race', { action: 'replay', raceId: r.id });
      const mineHost = x.race.host_id === me.user.id;
      const a = sideOf(x.host), b = sideOf(x.guest);
      const mySide = mineHost ? a : b, other = mineHost ? b : a;
      if (!mySide) return;
      setReplay({ track: x.track, seed: x.seed, me: { ...mySide, label: '' }, rival: other, race: x.race, key: Date.now() });
    } catch { setOld(r); }
  };

  const lim = d?.limits ?? { min: 100, max: 100000, bot_win_bps: 9000, fee_bps: 500 };
  const step = stake >= 50000 ? 25000 : stake >= 10000 ? 5000 : 2500;
  const setS = (v: number) => setStake(Math.max(lim.min, Math.min(lim.max, v)));
  const win = Math.floor(stake * lim.bot_win_bps / 10000);
  const canGo = !busy && car && stake <= me.balance;

  return (
    <>
      <AppBar title={t('Гонки')} />
      <div className="page">
        <Seg value={tab} onChange={setTab} options={[['go', t('Заезд')], ['pvp', t('Вызовы') + (d?.open?.length ? ' · ' + d.open.length : '')], ['history', t('История')]]} />

        {tab === 'go' && (
          <>
            <div className="tracks2">
              {TRACKS.map((x) => (
                <button key={x.id} className={`trk press t-${x.id}${track === x.id ? ' on' : ''}`} onClick={() => setTrack(x.id)}>
                  <div className="trk-art" />
                  <x.icon size={20} />
                  <b>{t(x.name)}</b>
                  <span>{t(x.how)}</span>
                  <i>{t('решают: {s}', { s: t(x.stats) })}</i>
                </button>
              ))}
            </div>

            <div className="card col g8">
              <div className="row between"><b>{t('Машина')}</b>{car && <span className="xs muted ell">{car.name}</span>}</div>
              <CarPicker value={car?.user_car_id ?? null} onPick={setCar} auto />
              {car && (
                <div className="spec-chips">
                  <span><b>{car.max_speed}</b> {t('км/ч')}</span>
                  <span><b>{(car.accel_x100 / 100).toFixed(1).replace('.', ',')}</b> {t('с до 100')}</span>
                  <span><b>{car.power}</b> {t('л.с.')}</span>
                  <span><b>{car.handling}</b> {t('управл.')}</span>
                  <span><b>{car.reliability}</b> {t('надёжн.')}</span>
                </div>
              )}
            </div>

            <div className="card stake-card">
              <div className="row between"><span className="sm muted">{t('Ставка')}</span><span className="xs muted">{t('баланс {m}', { m: money(me.balance) })}</span></div>
              <div className="stake-row">
                <button className="stake-btn press" onClick={() => setS(stake - step)} aria-label="−"><Minus size={20} /></button>
                <input className="stake-val num" inputMode="numeric" value={money(stake)} onChange={(e) => setStake(Number(e.target.value.replace(/\D/g, '')) || 0)} onBlur={() => setS(stake)} />
                <button className="stake-btn press" onClick={() => setS(stake + step)} aria-label="+"><Plus size={20} /></button>
              </div>
              <div className="chips">{[5000, 25000, 50000, 100000, 250000].filter((v) => v <= lim.max).map((v) => <button key={v} className={`chip${stake === v ? ' on' : ''}`} onClick={() => setS(v)}>{money(v)}</button>)}</div>
              <button className="btn go xl w" disabled={!canGo} onClick={() => start({ mode: 'bot', carId: car.user_car_id, track, stake })}>
                <Bot size={19} /> {t('Гонка с ботом')} <span className="btn-sub">+{money(win)}</span>
              </button>
              <button className="btn info w" disabled={!canGo} onClick={() => start({ mode: 'host', carId: car.user_car_id, track, stake })}>
                <Swords size={18} /> {t('Проехать и бросить вызов')}
              </button>
              <div className="xs faint">{t('Ты сам ведёшь машину. Вызов: твоё время увидят все, соперник едет против твоего «призрака». Победитель забирает банк минус {n}%. Выйдешь из заезда — ставка сгорит.', { n: lim.fee_bps / 100 })}</div>
            </div>

            {d && (
              <button className="card blue press" style={{ padding: 12 }} onClick={() => push({ name: 'skill' })}>
                <div className="row">
                  <Ic icon={Gauge} tone="blue" size={36} />
                  <div className="grow"><div className="sb">{t('Навык гонщика')} · {d.skill.level}/100</div><div className="xs muted">{t('Чем выше навык, тем быстрее трогаешься со старта')}</div></div>
                  <span className="btn info s">{t('Качать')}</span>
                </div>
              </button>
            )}
          </>
        )}

        {tab === 'pvp' && (
          d?.open?.length ? (
            <div className="card list">
              {d.open.map((r: any) => (
                <Li key={r.id} lead={<div style={{ width: 70 }}><CarArt car={r.host_car_info} height={34} /></div>}
                  title={<span>{trackName(r.track)} · {money(r.stake)}</span>}
                  sub={<span className="row g6"><Nick u={r.host} size={18} /> · <TimerIcon size={13} /> {sec(r.host_ms)}</span>}
                  right={r.host_id === me.user.id
                    ? <button className="btn bad s" onClick={async () => { try { await call('app_race', { action: 'cancel', raceId: r.id }); toast(t('Вызов отменён, ставка вернулась')); reload(); load(); } catch (e) { toast(errorText(e)); } }}><X size={16} /></button>
                    : <button className="btn go s" onClick={() => setAccept(r)}>{t('Принять')}</button>} />
              ))}
            </div>
          ) : <Empty icon={Swords} title={t('Вызовов пока нет')} text={t('Проедь заезд и брось вызов — его увидят все игроки.')} />
        )}

        {tab === 'history' && (
          <>
            {d && <div className="grid2"><div className="card"><div className="h2 num">{d.stats.n}</div><div className="sm muted">{t('заездов')}</div></div><div className="card"><div className="h2 num c-green">{d.stats.wins}</div><div className="sm muted">{t('побед')}</div></div></div>}
            {d?.mine?.length ? (
              <div className="card list">
                {d.mine.map((r: any) => {
                  const won = r.winner_id === me.user.id;
                  const mine = r.host_id === me.user.id ? r.host_ms : r.guest_ms, their = r.host_id === me.user.id ? r.guest_ms : r.host_ms;
                  return <Li key={r.id} icon={r.status === 'open' ? TimerIcon : won ? Trophy : Flag} tone={r.status === 'open' ? 'gray' : won ? 'green' : 'red'}
                    title={`${trackName(r.track)} · ${r.status === 'open' ? t('ждёт соперника') : r.status === 'cancelled' ? t('отменён') : won ? t('победа') : t('поражение')}`}
                    sub={r.status === 'done' ? `${sec(mine)} ${t('против')} ${sec(their)} · ${r.kind === 'bot' ? t('бот') : t('игрок')}` : r.host_ms ? `${t('твоё время')} ${sec(r.host_ms)}` : money(r.stake)}
                    right={r.status === 'done' ? <span className="row g6"><b className={`num ${won ? 'c-green' : 'c-red'}`}>{won ? '+' : '−'}{money(won ? (r.kind === 'bot' ? r.payout : r.payout - r.stake) : r.stake)}</b>{r.held ? <Play size={15} className="muted" /> : null}</span> : null}
                    onClick={r.status === 'done' ? () => (r.held ? openReplay(r) : setOld(r)) : undefined} />;
                })}
              </div>
            ) : <Empty icon={Flag} title={t('Заездов ещё не было')} />}
          </>
        )}
      </div>

      <Sheet open={!!accept} onClose={() => setAccept(null)} title={t('Принять вызов')}>
        {accept && (
          <>
            <div className="sm muted">{trackName(accept.track)} · {t('ставка {m}', { m: money(accept.stake) })}</div>
            <div className="row g8"><Nick u={accept.host} size={20} /><span className="sm">{accept.host_car_info?.name} · <b>{sec(accept.host_ms)}</b></span></div>
            <div className="xs faint">{t('Поедешь против его «призрака». Обгони — и банк твой.')}</div>
            <CarPicker value={car?.user_car_id ?? null} onPick={setCar} auto />
            <button className="btn go xl w" disabled={busy || !car || accept.stake > me.balance} onClick={async () => { const r = accept; setAccept(null); await start({ mode: 'guest', raceId: r.id, carId: car.user_car_id }); }}>{t('Гонка на {m}', { m: money(accept.stake) })}</button>
          </>
        )}
      </Sheet>

      <Sheet open={!!old} onClose={() => setOld(null)}>{old && <OldResult r={old} meId={me.user.id} />}</Sheet>

      {play && (
        <Drive key={play.drive.id} track={play.drive.track} seed={play.drive.seed} me={play.me} rival={play.rival} live
          onFinish={(inputs, ms) => send({ inputs, ms })}
          onExit={() => (res || pending ? close() : setAsk(true))}
          overlay={<>
            {ask && !res && (
              <div className="drive-card">
                <div className="h3">{t('Выйти из заезда?')}</div>
                <div className="sm muted">{t('Ставка {m} сгорит.', { m: money(play.drive.stake) })}</div>
                <div className="grid2"><button className="btn ghost" onClick={() => setAsk(false)}>{t('Ехать дальше')}</button><button className="btn bad" onClick={close}>{t('Выйти')}</button></div>
              </div>
            )}
            {pending && !res && (
              <div className="drive-card">
                <div className="h3">{t('Финиш')} · {fmtMs(pending.ms)}</div>
                <div className="sm muted">{t('Проверяем заезд…')}</div>
                <button className="btn ghost w" onClick={() => send(pending)}>{t('Отправить ещё раз')}</button>
              </div>
            )}
            {res && <ResultCard res={res} meId={me.user.id} mode={play.drive.mode}
              onAgain={() => start(play.params.mode === 'guest' ? { mode: 'bot', carId: play.params.carId, track: play.drive.track, stake: play.drive.stake } : play.params)}
              onClose={close} busy={busy} />}
          </>} />
      )}
      {replay && (
        <Drive key={replay.key} track={replay.track} seed={replay.seed} me={replay.me} rival={replay.rival} live={false} onExit={() => setReplay(null)}
          overlay={<div className="drive-tag">{t('Повтор')} · {trackName(replay.track)}
            <button className="btn ghost s" onClick={() => setReplay({ ...replay, key: Date.now() })}><RotateCcw size={14} /></button></div>} />
      )}
    </>
  );
}

function ResultCard({ res, meId, mode, onAgain, onClose, busy }: { res: any; meId: number; mode: string; onAgain: () => void; onClose: () => void; busy: boolean }) {
  const r = res.race;
  if (!r) {
    return (
      <div className="drive-card">
        <div className="h2">{mode === 'guest' ? t('Вызов уже принял другой') : t('Заезд не засчитан')}</div>
        <div className="sm muted">{mode === 'guest' ? t('Ставка вернулась на баланс.') : t('Ты не доехал до финиша — ставка сгорела.')}</div>
        <button className="btn go w" onClick={onClose}>{t('Готово')}</button>
      </div>
    );
  }
  if (r.status === 'open') {
    return (
      <div className="drive-card win">
        <div className="h2">{t('Вызов создан!')}</div>
        <div className="big-time num">{sec(r.host_ms)}</div>
        <div className="sm muted">{t('Твоё время видят все игроки. Кто обгонит — заберёт банк, не обгонят — банк твой.')}</div>
        <button className="btn go w" onClick={onClose}>{t('Готово')}</button>
      </div>
    );
  }
  const meHost = r.host_id === meId, won = r.winner_id === meId;
  const my = meHost ? r.host_ms : r.guest_ms, their = meHost ? r.guest_ms : r.host_ms;
  return (
    <div className={`drive-card ${won ? 'win' : 'lose'}`}>
      <div className={`h1 ${won ? 'c-green' : 'c-red'}`}>{won ? t('Победа!') : t('Поражение')}</div>
      <div className="grid2">
        <div><div className="xs muted">{t('Ты')}</div><b className="num big-time">{sec(my)}</b></div>
        <div><div className="xs muted">{r.kind === 'bot' ? t('Бот') : t('Соперник')}</div><b className="num big-time">{sec(their)}</b></div>
      </div>
      {my < DNF && their < DNF && <div className="sm muted">{won ? t('быстрее на {s}', { s: sec(their - my) }) : t('медленнее на {s}', { s: sec(my - their) })}</div>}
      <div className={`h2 num ${won ? 'c-green' : 'c-red'}`}>{won ? `+${money(r.kind === 'bot' ? r.payout : r.payout - r.stake)}` : `−${money(r.stake)}`}</div>
      <div className="grid2"><button className="btn ghost" onClick={onClose}>{t('Готово')}</button><button className="btn go" disabled={busy} onClick={onAgain}><RotateCcw size={16} /> {t('Ещё заезд')}</button></div>
    </div>
  );
}

// заезды до управляемых гонок: только итог
function OldResult({ r, meId }: { r: any; meId: number }) {
  const meHost = r.host_id === meId, won = r.winner_id === meId;
  const my = meHost ? r.host_ms : r.guest_ms, their = meHost ? r.guest_ms : r.host_ms;
  return (
    <div className={`race-result ${won ? 'win' : 'lose'}`}>
      <div className="h3">{trackName(r.track)}</div>
      <div className="result">{won ? t('Победа!') : t('Поражение')}</div>
      <div className="grid2">
        <div><div className="xs muted">{t('Ты')}</div><b className="num">{sec(my)}</b></div>
        <div><div className="xs muted">{r.kind === 'bot' ? t('Бот') : t('Соперник')}</div><b className="num">{sec(their)}</b></div>
      </div>
      <div className={`h2 num ${won ? 'c-green' : 'c-red'}`}>{won ? `+${money(r.kind === 'bot' ? r.payout : r.payout - r.stake)}` : `−${money(r.stake)}`}</div>
    </div>
  );
}
