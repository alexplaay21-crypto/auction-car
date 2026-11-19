import { useCallback, useEffect, useState } from 'react';
import { Flag, Swords, Timer as TimerIcon, Gauge, Trophy, X } from 'lucide-react';
import { call, clientId, errorText, haptic, toast } from '../tg';
import { money } from '../format';
import { CarArt, Sheet } from '../components';
import { AppBar, Sect, Li, Nick, Seg, CarPicker, Ic, Empty } from '../ui';
import { useApp } from '../App';

const TRACK_HINT: Record<string, string> = {
  drag: 'Решают разгон и мощность', circuit: 'Решают скорость и управляемость', rally: 'Решают управляемость и надёжность',
};
const sec = (ms: number) => (ms / 1000).toFixed(2).replace('.', ',') + ' с';

export function Race() {
  const { me, reload, push } = useApp();
  const [d, setD] = useState<any>(null);
  const [tab, setTab] = useState<'bot' | 'pvp' | 'history'>('bot');
  const [car, setCar] = useState<any>(null);
  const [track, setTrack] = useState('drag');
  const [stake, setStake] = useState('1000');
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState<any>(null);
  const [accept, setAccept] = useState<any>(null);

  const load = useCallback(() => call('app_race', {}).then(setD, (e) => toast(errorText(e))), []);
  useEffect(() => { load(); }, [load]);

  const run = async (input: any) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await call('app_race', { clientId: clientId(), ...input });
      if (r.race?.status === 'done') setShow(r.race); else toast('Вызов создан — ждём соперника');
      haptic('success'); reload(); load();
    } catch (e) { haptic('error'); toast(errorText(e)); }
    setBusy(false);
  };

  return (
    <>
      <AppBar title="Гонки" />
      <div className="page">
        {d && (
          <button className="card blue press" onClick={() => push({ name: 'skill' })}>
            <div className="row">
              <Ic icon={Gauge} tone="blue" />
              <div className="grow"><div className="h3">Навык гонщика · {d.skill.level}/100</div><div className="sm muted">Показатель {d.skill.reaction.toFixed(2).replace('.', ',')} → 0,20 · в гонках решает именно он</div></div>
              <span className="btn info s">Качать</span>
            </div>
          </button>
        )}
        <Seg value={tab} onChange={setTab} options={[['bot', 'Заезд'], ['pvp', `Вызовы${d?.open?.length ? ' · ' + d.open.length : ''}`], ['history', 'История']]} />

        {tab === 'bot' && (
          <>
            <Sect>Машина</Sect>
            <CarPicker value={car?.user_car_id ?? null} onPick={setCar} />
            <Sect>Трасса</Sect>
            <div className="grid3">
              {(d?.tracks ?? []).map((t: any) => (
                <button key={t.id} className={`card press${track === t.id ? ' accent' : ''}`} style={{ padding: 10, gap: 4 }} onClick={() => setTrack(t.id)}>
                  <Flag size={18} className={track === t.id ? 'c-orange' : 'muted'} /><div className="sb sm">{t.name}</div>
                </button>
              ))}
            </div>
            <div className="xs muted">{TRACK_HINT[track]}</div>
            <Sect>Ставка</Sect>
            <div className="card">
              <input className="inp big" inputMode="numeric" value={stake} onChange={(e) => setStake(e.target.value.replace(/\D/g, ''))} />
              <div className="chips">{[500, 1000, 5000, 10000, 50000].map((v) => <button key={v} className={`chip${Number(stake) === v ? ' on' : ''}`} onClick={() => setStake(String(v))}>{money(v)}</button>)}</div>
              <div className="sm muted">Победа над ботом: +{money(Math.floor((Number(stake) || 0) * (d?.limits.bot_win_bps ?? 9000) / 10000))} · баланс {money(me.balance)}</div>
              <div className="grid2">
                <button className="btn go xl" disabled={busy || !car} onClick={() => run({ action: 'bot', carId: car.user_car_id, track, stake: Number(stake) })}><Flag size={18} /> Старт</button>
                <button className="btn info xl" disabled={busy || !car} onClick={() => run({ action: 'create', carId: car.user_car_id, track, stake: Number(stake) })}><Swords size={18} /> Вызов</button>
              </div>
              <div className="xs faint">Вызов увидят все игроки во вкладке «Вызовы». Ставка в залоге, победитель забирает банк минус {(d?.limits.fee_bps ?? 500) / 100}%.</div>
            </div>
          </>
        )}

        {tab === 'pvp' && (
          d?.open?.length ? (
            <div className="card list">
              {d.open.map((r: any) => (
                <Li key={r.id} lead={<div style={{ width: 70 }}><CarArt car={r.host_car_info} height={34} /></div>}
                  title={<span>{r.track_name} · {money(r.stake)}</span>}
                  sub={<span className="row g6"><Nick u={r.host} size={18} /> · {r.host_car_info?.name}</span>}
                  right={r.host_id === me.user.id
                    ? <button className="btn bad s" onClick={async () => { try { await call('app_race', { action: 'cancel', raceId: r.id }); toast('Вызов отменён, ставка вернулась'); reload(); load(); } catch (e) { toast(errorText(e)); } }}><X size={16} /></button>
                    : <button className="btn go s" onClick={() => setAccept(r)}>Принять</button>} />
              ))}
            </div>
          ) : <Empty icon={Swords} title="Вызовов пока нет" text="Создай свой во вкладке «Заезд» — его увидят все игроки." />
        )}

        {tab === 'history' && (
          <>
            {d && <div className="grid2"><div className="card"><div className="h2 num">{d.stats.n}</div><div className="sm muted">заездов</div></div><div className="card"><div className="h2 num c-green">{d.stats.wins}</div><div className="sm muted">побед</div></div></div>}
            {d?.mine?.length ? (
              <div className="card list">
                {d.mine.map((r: any) => {
                  const won = r.winner_id === me.user.id;
                  return <Li key={r.id} icon={r.status === 'open' ? TimerIcon : won ? Trophy : Flag} tone={r.status === 'open' ? 'gray' : won ? 'green' : 'red'}
                    title={`${r.track_name} · ${r.status === 'open' ? 'ждёт соперника' : r.status === 'cancelled' ? 'отменён' : won ? 'победа' : 'поражение'}`}
                    sub={r.status === 'done' ? `${sec(r.host_ms)} против ${sec(r.guest_ms)} · ${r.kind === 'bot' ? 'бот' : 'игрок'}` : money(r.stake)}
                    right={<b className={`num ${r.status !== 'done' ? '' : won ? 'c-green' : 'c-red'}`}>{r.status !== 'done' ? '' : won ? '+' : '−'}{r.status === 'done' ? money(won ? (r.kind === 'bot' ? r.payout : r.payout - r.stake) : r.stake) : ''}</b>}
                    onClick={r.status === 'done' ? () => setShow(r) : undefined} />;
                })}
              </div>
            ) : <Empty icon={Flag} title="Заездов ещё не было" />}
          </>
        )}
      </div>

      <Sheet open={!!accept} onClose={() => setAccept(null)} title="Принять вызов">
        {accept && (
          <>
            <div className="sm muted">{accept.track_name} · ставка {money(accept.stake)} · соперник на {accept.host_car_info?.name}</div>
            <CarPicker value={car?.user_car_id ?? null} onPick={setCar} />
            <button className="btn go xl w" disabled={busy || !car} onClick={async () => { const r = accept; setAccept(null); await run({ action: 'accept', raceId: r.id, carId: car.user_car_id }); }}>Гонка на {money(accept.stake)}</button>
          </>
        )}
      </Sheet>

      <Sheet open={!!show} onClose={() => setShow(null)}>{show && <RaceReplay r={show} meId={me.user.id} />}</Sheet>
    </>
  );
}

// Анимация заезда: машины едут к финишу за время, пропорциональное результату.
function RaceReplay({ r, meId }: { r: any; meId: number }) {
  const [go, setGo] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => { const t = setTimeout(() => setGo(true), 80); const f = setTimeout(() => setDone(true), 3400); return () => { clearTimeout(t); clearTimeout(f); }; }, []);
  const fast = Math.min(r.host_ms, r.guest_ms);
  const dur = (ms: number) => 2.2 * (ms / fast);
  const meHost = r.host_id === meId;
  const won = r.winner_id === meId;
  const lane = (car: any, ms: number, label: string) => (
    <div className="lane">
      <span className="who">{label}</span>
      <div className="car" style={{ left: go ? 'calc(100% - 136px)' : '0px', transitionProperty: 'left', transitionDuration: `${dur(ms)}s` }}>
        <CarArt car={car} height={54} />
      </div>
    </div>
  );
  return (
    <div className="col g12">
      <div className="h3 center">{r.track_name}</div>
      <div className="track">
        <div className="finish" />
        {lane(r.host_car_info, r.host_ms, meHost ? 'Ты' : 'Соперник')}
        {lane(r.guest_car_info, r.guest_ms, r.kind === 'bot' ? 'Бот' : meHost ? 'Соперник' : 'Ты')}
      </div>
      {done ? (
        <div className="col g6 center">
          <div className={`result ${won ? 'c-green' : 'c-red'}`}>{won ? 'Победа!' : 'Поражение'}</div>
          <div className="sm muted">{sec(r.host_ms)} против {sec(r.guest_ms)}</div>
          <div className="h3">{won ? `+${money(r.kind === 'bot' ? r.payout : r.payout - r.stake)}` : `−${money(r.stake)}`}</div>
        </div>
      ) : <div className="center sm muted">Едем…</div>}
    </div>
  );
}
