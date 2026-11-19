import { useCallback, useEffect, useState } from 'react';
import { Trophy, History, Users, Send, Ticket, Shield, Crown, Package, Gavel, Repeat, TrendingUp, TrendingDown, Share2, CarFront, Gauge, Flag, Store, UserPlus, UserCheck, ShoppingBag } from 'lucide-react';
import { call, clientId, errorText, haptic, share, toast } from '../tg';
import { money, who, ago, LEDGER, RARITY, RARITIES } from '../format';
import { Avatar, CarArt, CarCard, RarityTag, Sheet, Stat, Money } from '../components';
import { AppBar, Sect, Li, Seg, Empty, Ic, Nick, Kv, FriendPicker } from '../ui';
import { useApp } from '../App';

const sec = (s: number) => s.toFixed(2).replace('.', ',') + ' с';

// Профиль игрока: свой (с личным меню) или чужой (статистика, гараж, друзья, перевод).
export function Player({ id, root = false }: { id: number; root?: boolean }) {
  const { me, pop, push, reload } = useApp();
  const [p, setP] = useState<any>(null);
  const [car, setCar] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => call('app_player', { action: 'get', id }).then(setP, (e) => { toast(errorText(e)); if (!root) pop(); }), [id, root, pop]);
  useEffect(() => { load(); }, [load]);
  const friend = async () => {
    setBusy(true);
    try { await call('app_player', { action: p.is_friend ? 'remove_friend' : 'add_friend', id }); haptic('success'); toast(p.is_friend ? 'Удалён из друзей' : 'Добавлен в друзья'); load(); } catch (e) { toast(errorText(e)); }
    setBusy(false);
  };
  if (!p) return <><AppBar title="Профиль" back={root ? undefined : pop} /><div className="page" /></>;
  const s = p.stats, u = p.user, mine = p.me;
  const R = p.garage.rarities;
  return (
    <>
      <AppBar title={mine ? 'Профиль' : who(u)} back={root ? undefined : pop} />
      <div className="page">
        <div className="card">
          <div className="row g12">
            <div style={{ position: 'relative' }}><Avatar u={u} size={64} />{u.online && <span className="online" style={{ position: 'absolute', right: 2, bottom: 2 }} />}</div>
            <div className="grow col">
              <div className="h2 ell">{u.first_name || who(u)}</div>
              <div className="sm muted">{u.username ? '@' + u.username : 'id ' + u.id} · {u.online ? 'в сети' : `был ${ago(u.last_seen)}`}</div>
              <div className="row g6">{u.is_vip ? <span className="rtag r-mythic">VIP</span> : null}<span className="rtag r-rare">#{p.place} в рейтинге</span>{p.bp.premium ? <span className="rtag r-epic">BP+</span> : null}</div>
            </div>
          </div>
          {mine ? (
            <div className="row between"><div className="col"><span className="sm muted">Баланс</span><Money value={me.balance} className="big-money" /></div><button className="btn go s" onClick={() => push({ name: 'shop' })}>Пополнить</button></div>
          ) : (
            <div className="grid2">
              <button className={`btn ${p.is_friend ? 'ok' : 'info'}`} disabled={busy} onClick={friend}>{p.is_friend ? <><UserCheck size={18} /> В друзьях</> : <><UserPlus size={18} /> В друзья</>}</button>
              <button className="btn go" onClick={() => push({ name: 'transfer', to: u.username ? '@' + u.username : String(u.id) })}><Send size={18} /> Перевести</button>
            </div>
          )}
        </div>

        <div className="grid3">
          <div className="card" style={{ padding: 12, gap: 2 }}><div className="h3 num">{money(p.garage.value)}</div><div className="xs muted">гараж ({p.garage.owned})</div></div>
          <div className="card" style={{ padding: 12, gap: 2 }}><div className="h3 num">{s.wins}</div><div className="xs muted">побед на аукционе</div></div>
          <div className="card" style={{ padding: 12, gap: 2 }}><div className="h3 num">{s.race_wins}/{s.races}</div><div className="xs muted">гонок выиграно</div></div>
        </div>

        <div className="grid2">
          <button className="card blue press" style={{ gap: 6 }} onClick={mine ? () => push({ name: 'skill' }) : undefined}>
            <div className="row between"><Ic icon={Gauge} tone="blue" size={34} /><span className="h3">{p.skill.level}/100</span></div>
            <div className="sb">Навык гонщика</div><div className="xs muted">реакция {sec(p.skill.reaction)}</div>
            <div className="bar blue"><i style={{ width: `${p.skill.level}%` }} /></div>
          </button>
          <button className="card press" style={{ gap: 6, borderColor: 'rgba(180,107,255,.4)' }} onClick={mine ? () => push({ name: 'bp' }) : undefined}>
            <div className="row between"><Ic icon={Trophy} tone="gold" size={34} /><span className="h3">{p.bp.level}/30</span></div>
            <div className="sb">Battle Pass</div><div className="xs muted">{p.bp.premium ? 'премиум' : 'бесплатный'}</div>
            <div className="bar"><i style={{ width: `${(p.bp.level / 30) * 100}%` }} /></div>
          </button>
        </div>

        <Sect>Статистика</Sect>
        <div className="card">
          <Kv k={<span className="row g8"><Package size={16} /> Открыто контейнеров</span>} v={s.containers_opened} />
          <Kv k={<span className="row g8"><Gavel size={16} /> Ставок</span>} v={s.bids_made} />
          <Kv k={<span className="row g8"><CarFront size={16} /> Получено машин</span>} v={s.cars_obtained} />
          <Kv k={<span className="row g8"><Repeat size={16} /> Продано машин</span>} v={s.cars_sold} />
          <Kv k={<span className="row g8"><TrendingUp size={16} /> Заработано</span>} v={money(s.earned_total)} c="var(--green)" />
          <Kv k={<span className="row g8"><TrendingDown size={16} /> Потрачено</span>} v={money(s.spent_total)} c="var(--red)" />
          <Kv k={<span className="row g8"><Users size={16} /> Пригласил друзей</span>} v={s.referrals} />
          <div className="row g6 wrap">{RARITIES.map((r) => <span key={r} className={`rtag r-${r}`}>{RARITY[r].name} · {R[r] ?? 0}</span>)}</div>
        </div>

        {mine && (
          <>
            <Sect>Моё</Sect>
            <div className="card list">
              <Li icon={CarFront} tone="gold" title="Гараж" sub={`${p.garage.owned} из ${p.garage.capacity} мест`} onClick={() => push({ name: 'garage' })} />
              <Li icon={Gauge} tone="blue" title="Навык гонщика" sub="Качай реакцию — в гонках решает она" onClick={() => push({ name: 'skill' })} />
              <Li icon={Trophy} tone="gold" title="Battle Pass" sub={`Уровень ${p.bp.level} из 30`} onClick={() => push({ name: 'bp' })} />
              <Li icon={Users} tone="green" title="Друзья" sub="Список, приглашения, быстрый выбор" onClick={() => push({ name: 'friends' })} />
              <Li icon={Send} title="Перевести деньги" sub={`Комиссия ${me.fees.transfer / 100}%`} onClick={() => push({ name: 'transfer' })} />
              <Li icon={Ticket} tone="blue" title="Промокод" onClick={() => push({ name: 'promo' })} />
              <Li icon={ShoppingBag} tone="red" title="Магазин и VIP" onClick={() => push({ name: 'shop' })} />
              <Li icon={Flag} tone="gray" title="Лидеры" onClick={() => push({ name: 'leaders' })} />
              <Li icon={History} tone="gray" title="История операций" onClick={() => push({ name: 'history' })} />
              {me.user.is_admin ? <Li icon={Shield} tone="red" title="Админ-панель" onClick={() => push({ name: 'admin' })} /> : null}
            </div>
          </>
        )}

        {!mine && (
          <>
            <Sect>Гараж · {p.garage.owned}</Sect>
            {p.cars.length ? <div className="grid2">{p.cars.map((c: any) => <CarCard key={c.user_car_id} car={c} ribbon={c.listing_id ? 'на продаже' : undefined} onClick={() => setCar(c)} />)}</div>
              : <Empty icon={CarFront} title="Гараж пуст" />}
          </>
        )}
      </div>

      <Sheet open={!!car} onClose={() => setCar(null)}>
        {car && (
          <div className={`col g12 r-${car.rarity}`}>
            <div className="reveal-art"><CarArt car={car} height={170} studio /></div>
            <div className="row between"><div className="h2 ell">{car.name}</div><RarityTag r={car.rarity} /></div>
            <Kv k="Стоимость" v={money(car.price)} />
            <Stat label="Скорость" value={car.max_speed} max={420} />
            <Stat label="Мощность" value={car.power} max={1200} />
            <Stat label="Управляемость" value={car.handling} />
            {car.listing_id ? (
              <button className="btn go xl w" disabled={busy} onClick={async () => {
                setBusy(true);
                try { await call('app_market', { action: 'buy', listingId: car.listing_id }); haptic('success'); toast('Машина твоя'); setCar(null); reload(); load(); } catch (e) { haptic('error'); toast(errorText(e)); }
                setBusy(false);
              }}><Store size={18} /> Купить за {money(car.ask)}</button>
            ) : <div className="sm muted center">Не продаётся. Можно предложить сделку через бота или дождаться лота на рынке.</div>}
          </div>
        )}
      </Sheet>
    </>
  );
}

export function SkillPage() {
  const { pop, reload } = useApp();
  const [s, setS] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { call('app_player', { action: 'skill' }).then(setS, (e) => toast(errorText(e))); }, []);
  const buy = async (count: number) => {
    setBusy(true);
    try { setS(await call('app_player', { action: 'buy_skill', count, clientId: clientId() })); haptic('success'); toast('Навык улучшен'); reload(); } catch (e) { haptic('error'); toast(errorText(e)); }
    setBusy(false);
  };
  return (
    <>
      <AppBar title="Навык гонщика" back={pop} />
      <div className="page">
        {s && (
          <>
            <div className="card blue">
              <div className="row"><Ic icon={Gauge} tone="blue" size={46} /><div className="grow"><div className="sm muted">Уровень</div><div className="skill-big">{s.level}<span className="h3 muted"> / {s.max_level}</span></div></div></div>
              <div className="bar blue"><i style={{ width: `${(s.purchases / s.max) * 100}%` }} /></div>
              <Kv k="Реакция на старте" v={sec(s.reaction)} c="var(--blue)" />
              <Kv k="Лучшая возможная" v={sec(s.best)} />
              <Kv k="Улучшений" v={`${s.purchases} из ${s.max}`} />
              <div className="xs faint">Реакция прибавляется ко времени каждого заезда. Каждые 4 улучшения — новый уровень. Первые уровни дешёвые и дают больше всего, последние — дорогие.</div>
            </div>
            {s.price1 != null ? (
              <div className="card">
                <Kv k="Следующее улучшение" v={`${sec(s.reaction)} → ${sec(s.next_reaction)}`} />
                <button className="btn go xl w" disabled={busy || s.balance < s.price1} onClick={() => buy(1)}>Улучшить · {money(s.price1)}</button>
                {s.price10 != null && <>
                  <Kv k="Сразу ×10" v={`→ ${sec(s.reaction10)}`} />
                  <button className="btn info xl w" disabled={busy || s.balance < s.price10} onClick={() => buy(10)}>Улучшить ×10 · {money(s.price10)}</button>
                </>}
                <div className="xs muted center">Баланс {money(s.balance)}</div>
              </div>
            ) : <div className="card gold"><div className="h3 center">Максимальный уровень!</div></div>}
          </>
        )}
      </div>
    </>
  );
}

export function LeadersPage() {
  const { pop } = useApp();
  const [kind, setKind] = useState<'balance' | 'garage' | 'wins' | 'racers'>('balance');
  const [list, setList] = useState<any[] | null>(null);
  useEffect(() => { setList(null); call('app_shop', { action: 'top', kind }).then((r) => setList(r.list), () => setList([])); }, [kind]);
  return (
    <>
      <AppBar title="Лидеры" back={pop} />
      <div className="page">
        <Seg value={kind} onChange={setKind} options={[['balance', 'Деньги'], ['garage', 'Гараж'], ['wins', 'Аукцион'], ['racers', 'Гонки']]} />
        <div className="card list">
          {list?.map((u, i) => (
            <Li key={u.id} lead={<span className="b num" style={{ width: 26, textAlign: 'center' }}>{['🥇', '🥈', '🥉'][i] ?? i + 1}</span>} title={<Nick u={u} />}
              right={<b className="num">{kind === 'balance' || kind === 'garage' ? money(u.value) : u.value}</b>} />
          )) ?? <Li title="Загрузка…" />}
        </div>
      </div>
    </>
  );
}

export function HistoryPage() {
  const { pop } = useApp();
  const [items, setItems] = useState<any[] | null>(null);
  useEffect(() => { call('app_me', { action: 'history' }).then((r) => setItems(r.items), () => setItems([])); }, []);
  return (
    <>
      <AppBar title="История операций" back={pop} />
      <div className="page">
        {items && !items.length ? <Empty icon={History} title="Операций пока нет" /> : (
          <div className="card list">
            {items?.map((h, i) => (
              <Li key={i} icon={h.delta > 0 ? TrendingUp : TrendingDown} tone={h.delta > 0 ? 'green' : 'red'} title={LEDGER[h.kind] ?? h.kind}
                sub={`${ago(h.created_at)} · баланс ${money(h.balance_after)}`} right={<b className={`num ${h.delta > 0 ? 'c-green' : 'c-red'}`}>{h.delta > 0 ? '+' : ''}{money(h.delta)}</b>} />
            )) ?? <Li title="Загрузка…" />}
          </div>
        )}
      </div>
    </>
  );
}

export function FriendsPage() {
  const { me, pop } = useApp();
  const [f, setF] = useState<any>(null);
  const [ref, setRef] = useState<any>(null);
  const [add, setAdd] = useState('');
  const load = () => call('app_player', { action: 'friends' }).then(setF, () => {});
  useEffect(() => { load(); call('app_me', { action: 'referrals' }).then(setRef, () => {}); }, []);
  return (
    <>
      <AppBar title="Друзья" back={pop} />
      <div className="page">
        <div className="card">
          <div className="row g8">
            <input className="inp" placeholder="@username или ID" value={add} onChange={(e) => setAdd(e.target.value)} />
            <button className="btn go" disabled={!add} onClick={async () => { try { await call('app_player', { action: 'add_friend', ref: add }); toast('Добавлен в друзья'); setAdd(''); load(); } catch (e) { toast(errorText(e)); } }}><UserPlus size={18} /></button>
          </div>
          <div className="xs faint">Друзья появляются в быстром выборе при переводе и продаже машины.</div>
        </div>
        <Sect>Мои друзья · {f?.friends.length ?? 0}</Sect>
        {f && !f.friends.length ? <Empty icon={Users} title="Пока никого" text="Открой профиль игрока (нажми на ник) и добавь в друзья." /> : (
          <div className="card list">{f?.friends.map((x: any) => <Li key={x.id} lead={<Avatar u={x} size={36} />} title={<Nick u={x} noAva />} sub={ago(x.last_seen)} />)}</div>
        )}
        <Sect>Пригласить</Sect>
        <div className="card accent">
          <Kv k="Тебе за друга" v={money(me.referral.inviter)} c="var(--green)" />
          <Kv k="Другу за регистрацию" v={money(me.referral.invited)} />
          <Kv k="За первую покупку друга" v={money(me.referral.first_purchase)} />
          <Kv k={`Каждые ${me.referral.epic_every} друзей`} v="эпическая машина" c="var(--epic)" />
          <button className="btn go xl w" disabled={!ref} onClick={() => ref && share(ref.link, 'Залетай на аукцион машин!')}><Share2 size={18} /> Пригласить</button>
        </div>
        {ref?.list?.length > 0 && (
          <>
            <Sect>Приглашены · {ref.list.length}</Sect>
            <div className="card list">{ref.list.map((x: any) => <Li key={x.id} lead={<Avatar u={x} size={36} />} title={<Nick u={x} noAva />} sub={ago(x.created_at)} />)}</div>
          </>
        )}
      </div>
    </>
  );
}

export function TransferPage({ to: initial = '' }: { to?: string }) {
  const { me, pop, reload } = useApp();
  const [to, setTo] = useState(initial);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const net = Math.floor((Number(amount) || 0) * (1 - me.fees.transfer / 10000));
  return (
    <>
      <AppBar title="Перевод" back={pop} />
      <div className="page">
        <Sect>Кому</Sect>
        <FriendPicker value={to} onPick={setTo} />
        <input className="inp" placeholder="@username или ID игрока" value={to} onChange={(e) => setTo(e.target.value)} />
        <Sect>Сколько</Sect>
        <div className="card">
          <input className="inp big" inputMode="numeric" placeholder="$0" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} />
          <div className="chips">{[1000, 5000, 10000, 50000].map((v) => <button key={v} className="chip" onClick={() => setAmount(String(v))}>{money(v)}</button>)}</div>
          <Kv k="Комиссия" v={`${me.fees.transfer / 100}%`} />
          <Kv k="Получит" v={money(net)} c="var(--green)" />
          <Kv k="Твой баланс" v={money(me.balance)} />
          <button className="btn go xl w" disabled={busy || !to || !amount} onClick={async () => {
            setBusy(true);
            try { const r = await call('app_me', { action: 'transfer', to, amount: Number(amount), clientId: clientId() }); haptic('success'); toast(`Переведено, получит ${money(r.result.net)}`); await reload(); pop(); }
            catch (e) { haptic('error'); toast(errorText(e)); }
            setBusy(false);
          }}><Send size={18} /> Перевести</button>
        </div>
      </div>
    </>
  );
}

export function PromoPage() {
  const { pop, reload } = useApp();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <>
      <AppBar title="Промокод" back={pop} />
      <div className="page">
        <div className="card">
          <div className="row"><Ic icon={Ticket} tone="blue" /><div className="grow"><div className="h3">Введи промокод</div><div className="sm muted">Деньги, контейнеры, машины или VIP</div></div></div>
          <input className="inp big" placeholder="КОД" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ''))} />
          <button className="btn go xl w" disabled={busy || code.length < 3} onClick={async () => {
            setBusy(true);
            try { await call('app_me', { action: 'promo', code, clientId: clientId() }); haptic('success'); toast('Промокод активирован'); await reload(); pop(); }
            catch (e) { haptic('error'); toast(errorText(e)); }
            setBusy(false);
          }}>Активировать</button>
        </div>
      </div>
    </>
  );
}

void Crown;
