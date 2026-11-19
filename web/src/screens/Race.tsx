import { useCallback, useEffect, useState } from 'react';
import { Flag, Swords, Timer as TimerIcon, Gauge, Trophy, X, Zap, RotateCw, Mountain, Minus, Plus, CarFront } from 'lucide-react';
import { call, clientId, errorText, haptic, toast } from '../tg';
import { money } from '../format';
import { CarArt, Sheet, RarityTag } from '../components';
import { AppBar, Sect, Li, Nick, Seg, CarPicker, Ic, Empty } from '../ui';
import { useApp } from '../App';
import { t } from '../i18n';

const TRACK_HINT: Record<string, string> = {
  drag: 'Решают разгон и мощность', circuit: 'Решают скорость и управляемость', rally: 'Решают управляемость и надёжность',
};
const sec = (ms: number) => (ms / 1000).toFixed(2).replace('.', ',') + t(' с');

const TRACK_ICON: Record<string, any> = { drag: Zap, circuit: RotateCw, rally: Mountain };
const STATS: [string, string][] = [['speed', 'Скорость'], ['accel', 'Разгон'], ['power', 'Мощность'], ['handling', 'Управление'], ['reliability', 'Надёжность']];
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
// те же формулы, что на сервере (lib/race.js), — чтобы показать форму машины на трассе
function norm(c: any): Record<string, number> {
  return {
    accel: clamp01((12 - c.accel_x100 / 100) / 10), power: clamp01(c.power / 1000), speed: clamp01((c.max_speed - 140) / 280),
    handling: clamp01(c.handling / 100), reliability: clamp01(c.reliability / 100),
  };
}
const perfOf = (c: any, w: Record<string, number>) => { const n = norm(c); return Object.entries(w ?? {}).reduce((s, [k, v]) => s + (n[k] ?? 0) * v, 0); };

export function Race() {
  const { me, reload, push } = useApp();
  const [d, setD] = useState<any>(null);
  const [tab, setTab] = useState<'bot' | 'pvp' | 'history'>('bot');
  const [car, setCar] = useState<any>(null);
  const [track, setTrack] = useState('drag');
  const [stake, setStake] = useState(1000);
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
      if (r.race?.status === 'done') setShow(r.race); else toast(t('Вызов создан — ждём соперника'));
      haptic('success'); reload(); load();
    } catch (e) { haptic('error'); toast(errorText(e)); }
    setBusy(false);
  };

  const tr = d?.tracks?.find((x: any) => x.id === track);
  const w = tr?.weights ?? {};
  const form = car ? Math.round(perfOf(car, w) * 100) : null;
  const lim = d?.limits ?? { min: 100, max: 100000, bot_win_bps: 9000, fee_bps: 500 };
  const step = stake >= 10000 ? 5000 : stake >= 2000 ? 1000 : 500;
  const setS = (v: number) => setStake(Math.max(lim.min, Math.min(lim.max, v)));
  const win = Math.floor(stake * lim.bot_win_bps / 10000);

  return (
    <>
      <AppBar title={t('Гонки')} />
      <div className="page">
        <Seg value={tab} onChange={setTab} options={[['bot', t('Заезд')], ['pvp', t('Вызовы') + (d?.open?.length ? ' · ' + d.open.length : '')], ['history', t('История')]]} />

        {tab === 'bot' && (
          <>
            <div className={`race-hero t-${track}`}>
              <div className="race-road" />
              {car ? (
                <>
                  <div className="race-hero-car"><CarArt car={car} height={120} /></div>
                  <div className="race-hero-top">
                    <div className="col" style={{ minWidth: 0 }}><b className="ell">{car.name}</b><RarityTag r={car.rarity} /></div>
                    <div className="form-ring" style={{ ['--p' as any]: form ?? 0 }}><b>{form}</b><span>{t('форма')}</span></div>
                  </div>
                </>
              ) : <div className="race-hero-empty"><CarFront size={34} /><span>{t('Выбери машину ниже')}</span></div>}
            </div>
            <CarPicker value={car?.user_car_id ?? null} onPick={setCar} />

            {car && (
              <div className="card stats-card">
                {STATS.map(([k, label]) => {
                  const v = norm(car)[k], key = (w[k] ?? 0) >= 0.25;
                  return (
                    <div key={k} className={`stat-row${key ? ' key' : ''}`}>
                      <span>{t(label)}</span>
                      <div className="stat-bar"><i style={{ width: `${Math.round(v * 100)}%` }} /></div>
                      <b className="num">{Math.round(v * 100)}</b>
                    </div>
                  );
                })}
                <div className="xs faint">{t('Оранжевым — что решает на этой трассе')}</div>
              </div>
            )}

            <div className="track-tiles">
              {(d?.tracks ?? []).map((x: any) => {
                const I = TRACK_ICON[x.id] ?? Flag;
                return (
                  <button key={x.id} className={`track-tile press t-${x.id}${track === x.id ? ' on' : ''}`} onClick={() => setTrack(x.id)}>
                    <I size={22} /><b>{t(x.name)}</b><span>{t(TRACK_HINT[x.id])}</span>
                  </button>
                );
              })}
            </div>

            <div className="card stake-card">
              <div className="row between"><span className="sm muted">{t('Ставка')}</span><span className="xs muted">{t('баланс {m}', { m: money(me.balance) })}</span></div>
              <div className="stake-row">
                <button className="stake-btn press" onClick={() => setS(stake - step)} aria-label="−"><Minus size={20} /></button>
                <input className="stake-val num" inputMode="numeric" value={money(stake)} onChange={(e) => setStake(Number(e.target.value.replace(/\D/g, '')) || 0)} onBlur={() => setS(stake)} />
                <button className="stake-btn press" onClick={() => setS(stake + step)} aria-label="+"><Plus size={20} /></button>
              </div>
              <div className="chips">{[1000, 5000, 10000, 25000, 50000].filter((v) => v <= lim.max).map((v) => <button key={v} className={`chip${stake === v ? ' on' : ''}`} onClick={() => setS(v)}>{money(v)}</button>)}</div>
              <div className="win-line"><span>{t('Победа над ботом')}</span><b className="c-green num">+{money(win)}</b></div>
              <button className="btn go xl w" disabled={busy || !car || stake > me.balance} onClick={() => run({ action: 'bot', carId: car.user_car_id, track, stake })}><Flag size={18} /> {t('Старт')}</button>
              <button className="btn info w" disabled={busy || !car || stake > me.balance} onClick={() => run({ action: 'create', carId: car.user_car_id, track, stake })}><Swords size={18} /> {t('Бросить вызов игрокам')}</button>
              <div className="xs faint">{t('Вызов увидят все игроки во вкладке «Вызовы». Ставка в залоге, победитель забирает банк минус {n}%.', { n: lim.fee_bps / 100 })}</div>
            </div>

            {d && (
              <button className="card blue press" style={{ padding: 12 }} onClick={() => push({ name: 'skill' })}>
                <div className="row">
                  <Ic icon={Gauge} tone="blue" size={36} />
                  <div className="grow"><div className="sb">{t('Навык гонщика')} · {d.skill.level}/100</div><div className="xs muted">{t('Показатель {v} → 0,20 · в гонках решает именно он', { v: d.skill.reaction.toFixed(2).replace('.', ',') })}</div></div>
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
                  title={<span>{t(r.track_name)} · {money(r.stake)}</span>}
                  sub={<span className="row g6"><Nick u={r.host} size={18} /> · {r.host_car_info?.name}</span>}
                  right={r.host_id === me.user.id
                    ? <button className="btn bad s" onClick={async () => { try { await call('app_race', { action: 'cancel', raceId: r.id }); toast(t('Вызов отменён, ставка вернулась')); reload(); load(); } catch (e) { toast(errorText(e)); } }}><X size={16} /></button>
                    : <button className="btn go s" onClick={() => setAccept(r)}>{t('Принять')}</button>} />
              ))}
            </div>
          ) : <Empty icon={Swords} title={t('Вызовов пока нет')} text={t('Создай свой во вкладке «Заезд» — его увидят все игроки.')} />
        )}

        {tab === 'history' && (
          <>
            {d && <div className="grid2"><div className="card"><div className="h2 num">{d.stats.n}</div><div className="sm muted">{t('заездов')}</div></div><div className="card"><div className="h2 num c-green">{d.stats.wins}</div><div className="sm muted">{t('побед')}</div></div></div>}
            {d?.mine?.length ? (
              <div className="card list">
                {d.mine.map((r: any) => {
                  const won = r.winner_id === me.user.id;
                  return <Li key={r.id} icon={r.status === 'open' ? TimerIcon : won ? Trophy : Flag} tone={r.status === 'open' ? 'gray' : won ? 'green' : 'red'}
                    title={`${t(r.track_name)} · ${r.status === 'open' ? t('ждёт соперника') : r.status === 'cancelled' ? t('отменён') : won ? t('победа') : t('поражение')}`}
                    sub={r.status === 'done' ? `${sec(r.host_ms)} ${t('против')} ${sec(r.guest_ms)} · ${r.kind === 'bot' ? t('бот') : t('игрок')}` : money(r.stake)}
                    right={<b className={`num ${r.status !== 'done' ? '' : won ? 'c-green' : 'c-red'}`}>{r.status !== 'done' ? '' : won ? '+' : '−'}{r.status === 'done' ? money(won ? (r.kind === 'bot' ? r.payout : r.payout - r.stake) : r.stake) : ''}</b>}
                    onClick={r.status === 'done' ? () => setShow(r) : undefined} />;
                })}
              </div>
            ) : <Empty icon={Flag} title={t('Заездов ещё не было')} />}
          </>
        )}
      </div>

      <Sheet open={!!accept} onClose={() => setAccept(null)} title={t('Принять вызов')}>
        {accept && (
          <>
            <div className="sm muted">{t(accept.track_name)} · {t('ставка {m} · соперник на {c}', { m: money(accept.stake), c: accept.host_car_info?.name })}</div>
            <CarPicker value={car?.user_car_id ?? null} onPick={setCar} />
            <button className="btn go xl w" disabled={busy || !car} onClick={async () => { const r = accept; setAccept(null); await run({ action: 'accept', raceId: r.id, carId: car.user_car_id }); }}>{t('Гонка на {m}', { m: money(accept.stake) })}</button>
          </>
        )}
      </Sheet>

      <Sheet open={!!show} onClose={() => setShow(null)}>{show && <RaceReplay r={show} meId={me.user.id} />}</Sheet>
    </>
  );
}

// Заезд: светофор 3-2-1, машины едут к финишу за время, пропорциональное результату.
function RaceReplay({ r, meId }: { r: any; meId: number }) {
  const [light, setLight] = useState(0); // 0..3 красные, 4 — зелёный
  const [done, setDone] = useState(false);
  useEffect(() => {
    const ts = [1, 2, 3, 4].map((n) => setTimeout(() => setLight(n), n * 450));
    const f = setTimeout(() => setDone(true), 1800 + 2600);
    return () => { ts.forEach(clearTimeout); clearTimeout(f); };
  }, []);
  const go = light >= 4;
  const fast = Math.min(r.host_ms, r.guest_ms);
  const dur = (ms: number) => 2.4 * (ms / fast);
  const meHost = r.host_id === meId;
  const won = r.winner_id === meId;
  const myMs = meHost ? r.host_ms : r.guest_ms, theirMs = meHost ? r.guest_ms : r.host_ms;
  const lane = (car: any, ms: number, label: string, mine: boolean) => (
    <div className={`lane${mine ? ' mine' : ''}`}>
      <span className="who">{label}</span>
      <div className="car" style={{ left: go ? 'calc(100% - 128px)' : '4px', transitionProperty: 'left', transitionDuration: `${dur(ms)}s` }}>
        <CarArt car={car} height={50} />
      </div>
    </div>
  );
  return (
    <div className="col g12">
      <div className="row between"><div className="h3">{t(r.track_name)}</div>
        <div className="lights">{[1, 2, 3].map((n) => <i key={n} className={go ? 'g' : light >= n ? 'r' : ''} />)}</div></div>
      <div className={`track${go && !done ? ' moving' : ''}`}>
        <div className="finish" />
        {lane(r.host_car_info, r.host_ms, meHost ? t('Ты') : t('Соперник'), meHost)}
        {lane(r.guest_car_info, r.guest_ms, r.kind === 'bot' ? t('Бот') : meHost ? t('Соперник') : t('Ты'), !meHost)}
      </div>
      {done ? (
        <div className={`race-result ${won ? 'win' : 'lose'}`}>
          <div className="result">{won ? t('Победа!') : t('Поражение')}</div>
          <div className="grid2">
            <div><div className="xs muted">{t('Ты')}</div><b className="num">{sec(myMs)}</b></div>
            <div><div className="xs muted">{r.kind === 'bot' ? t('Бот') : t('Соперник')}</div><b className="num">{sec(theirMs)}</b></div>
          </div>
          <div className="sm muted">{won ? t('быстрее на {s}', { s: sec(theirMs - myMs) }) : t('медленнее на {s}', { s: sec(myMs - theirMs) })}</div>
          <div className={`h2 num ${won ? 'c-green' : 'c-red'}`}>{won ? `+${money(r.kind === 'bot' ? r.payout : r.payout - r.stake)}` : `−${money(r.stake)}`}</div>
        </div>
      ) : <div className="center sm muted">{go ? t('Едем…') : t('На старт…')}</div>}
    </div>
  );
}
