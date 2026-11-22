import { useCallback, useEffect, useState } from 'react';
import { Trophy, History, Users, Send, Ticket, Shield, TrendingUp, TrendingDown, Share2, CarFront, Gauge, Flag, Store, UserPlus, UserCheck, ShoppingBag, Settings, BarChart3, MessageSquareWarning, Bug, Lightbulb, Palette } from 'lucide-react';
import { call, clientId, errorText, haptic, share, toast } from '../tg';
import { short, money, who, ago, LEDGER, RARITY, RARITIES } from '../format';
import { t } from '../i18n';
import { Avatar, CarArt, CarCard, CarInfo, RarityTag, Sheet, Stat, Money, ProfileBg } from '../components';
import { AppBar, Sect, Li, Seg, Empty, Ic, Nick, Kv, FriendPicker } from '../ui';
import { useApp } from '../App';

const num = (s: number) => s.toFixed(2).replace('.', ',');

// Профиль игрока: свой (с меню) или чужой (статистика, гараж, друзья, перевод).
export function Player({ id, root = false }: { id: number; root?: boolean }) {
  const { me, pop, push, reload } = useApp();
  const [p, setP] = useState<any>(null);
  const [car, setCar] = useState<any>(null);
  const [stats, setStats] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => call('app_player', { action: 'get', id }).then(setP, (e) => { toast(errorText(e)); if (!root) pop(); }), [id, root, pop]);
  useEffect(() => { load(); }, [load]);
  const friend = async () => {
    setBusy(true);
    try { await call('app_player', { action: p.is_friend ? 'remove_friend' : 'add_friend', id }); haptic('success'); toast(p.is_friend ? t('Удалён из друзей') : t('Добавлен в друзья')); load(); } catch (e) { toast(errorText(e)); }
    setBusy(false);
  };
  if (!p) return <><AppBar title={t('Профиль')} back={root ? undefined : pop} /><div className="page" /></>;
  const s = p.stats, u = p.user, mine = p.me;
  return (
    <>
      <AppBar title={mine ? t('Профиль') : who(u)} back={root ? undefined : pop} />
      <div className="page">
        <div className="card phead">
          <ProfileBg id={u.profile_bg} />
          <div className="row">
            <div style={{ position: 'relative' }}><Avatar u={u} size={56} />{u.online && <span className="online" style={{ position: 'absolute', right: 1, bottom: 1 }} />}</div>
            <div className="grow col" style={{ gap: 2 }}>
              <div className="h3 ell">{u.first_name || who(u)} {u.is_vip ? <span className="rtag r-mythic">VIP</span> : null}</div>
              <div className="xs muted">{u.username ? '@' + u.username : 'id ' + u.id} · {u.online ? t('в сети') : t('был {t}', { t: ago(u.last_seen) })} · #{p.place}</div>
            </div>
            {mine && <button className="back" onClick={() => push({ name: 'settings' })} aria-label={t('Настройки')}><Settings size={18} /></button>}
          </div>
          {mine ? (
            <div className="row between"><Money value={me.balance} className="big-money" /><button className="btn go s" onClick={() => push({ name: 'shop' })}>{t('Магазин')}</button></div>
          ) : (
            <div className="grid2">
              <button className={`btn s ${p.is_friend ? 'ok' : 'info'}`} disabled={busy} onClick={friend}>{p.is_friend ? <><UserCheck size={16} /> {t('В друзьях')}</> : <><UserPlus size={16} /> {t('В друзья')}</>}</button>
              <button className="btn go s" onClick={() => push({ name: 'transfer', to: u.username ? '@' + u.username : String(u.id) })}><Send size={16} /> {t('Перевести')}</button>
            </div>
          )}
        </div>

        <div className="statgrid">
          <div><b>{short(p.garage.value)}</b><span>{t('гараж')}</span></div>
          <div><b>{s.wins}</b><span>{t('аукцион')}</span></div>
          <div><b>{s.race_wins}/{s.races}</b><span>{t('гонки')}</span></div>
          <div><b>{p.skill.level}</b><span>{t('навык')}</span></div>
        </div>

        {mine ? (
          <>
            <div className="card list">
              <Li icon={CarFront} tone="gold" title={t('Гараж')} sub={t('{a} из {b} мест', { a: p.garage.owned, b: p.garage.capacity })} onClick={() => push({ name: 'garage' })} />
              <Li icon={Gauge} tone="blue" title={t('Навык гонщика')} sub={t('Уровень {a} из 100 · показатель {v}', { a: p.skill.level, v: num(p.skill.reaction) })} onClick={() => push({ name: 'skill' })} />
              <Li icon={Trophy} tone="gold" title="Battle Pass" sub={p.bp.max ? t('Уровень {a} из {b}', { a: p.bp.level, b: p.bp.max }) : t('Сезон не идёт')} onClick={() => push({ name: 'bp' })} />
              <Li icon={Users} tone="green" title={t('Друзья')} onClick={() => push({ name: 'friends' })} />
            </div>
            <div className="card list">
              <Li icon={Send} title={t('Перевести деньги')} onClick={() => push({ name: 'transfer' })} />
              <Li icon={Ticket} tone="blue" title={t('Промокод')} onClick={() => push({ name: 'promo' })} />
              <Li icon={ShoppingBag} tone="red" title={t('Магазин и VIP')} onClick={() => push({ name: 'shop' })} />
              <Li icon={Palette} tone="blue" title={t('Оформление профиля')} sub={t('Фоны и рамки с анимацией')} onClick={() => push({ name: 'style' })} />
              <Li icon={BarChart3} tone="gray" title={t('Статистика')} onClick={() => setStats(true)} />
              <Li icon={Flag} tone="gray" title={t('Лидеры')} onClick={() => push({ name: 'leaders' })} />
              <Li icon={History} tone="gray" title={t('История операций')} onClick={() => push({ name: 'history' })} />
              <Li icon={MessageSquareWarning} tone="blue" title={t('Сообщить о проблеме или идее')} onClick={() => push({ name: 'feedback' })} />
              <Li icon={Settings} tone="gray" title={t('Настройки')} sub={t('Язык, звук, уведомления')} onClick={() => push({ name: 'settings' })} />
              {me.user.is_admin ? <Li icon={Shield} tone="red" title={t('Админ-панель')} onClick={() => push({ name: 'admin' })} /> : null}
            </div>
          </>
        ) : (
          <>
            <button className="btn w s" onClick={() => setStats(true)}><BarChart3 size={16} /> {t('Статистика')}</button>
            <Sect>{t('Гараж')} · {p.garage.owned}</Sect>
            {p.cars.length ? <div className="grid2">{p.cars.map((c: any) => <CarCard key={c.user_car_id} car={c} ribbon={c.listing_id ? t('на продаже') : undefined} onClick={() => setCar(c)} />)}</div>
              : <Empty icon={CarFront} title={t('Гараж пуст')} />}
          </>
        )}
      </div>

      <Sheet open={stats} onClose={() => setStats(false)} title={t('Статистика')}>
        <div className="card">
          <Kv k={t('Открыто контейнеров')} v={s.containers_opened} />
          <Kv k={t('Побед на аукционе')} v={s.wins} />
          <Kv k={t('Ставок')} v={s.bids_made} />
          <Kv k={t('Получено машин')} v={s.cars_obtained} />
          <Kv k={t('Продано машин')} v={s.cars_sold} />
          <Kv k={t('Гонок / побед')} v={`${s.races} / ${s.race_wins}`} />
          <Kv k={t('Заработано')} v={money(s.earned_total)} c="var(--green)" />
          <Kv k={t('Потрачено')} v={money(s.spent_total)} c="var(--red)" />
          <Kv k={t('Пригласил друзей')} v={s.referrals} />
          <div className="row g6 wrap">{RARITIES.map((r) => <span key={r} className={`rtag r-${r}`}>{RARITY[r].name} · {p.garage.rarities[r] ?? 0}</span>)}</div>
        </div>
      </Sheet>

      <Sheet open={!!car} onClose={() => setCar(null)}>
        {car && (
          <CarInfo car={car}>
            {car.listing_id ? (
              <button className="btn go xl w" disabled={busy} onClick={async () => {
                setBusy(true);
                try { await call('app_market', { action: 'buy', listingId: car.listing_id }); haptic('success'); toast(t('Машина твоя')); setCar(null); reload(); load(); } catch (e) { haptic('error'); toast(errorText(e)); }
                setBusy(false);
              }}><Store size={18} /> {t('Купить за {m}', { m: money(car.ask) })}</button>
            ) : <div className="sm muted center">{t('Не продаётся')}</div>}
          </CarInfo>
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
    try { setS(await call('app_player', { action: 'buy_skill', count, clientId: clientId() })); haptic('success'); toast(t('Навык улучшен')); reload(); } catch (e) { haptic('error'); toast(errorText(e)); }
    setBusy(false);
  };
  return (
    <>
      <AppBar title={t('Навык гонщика')} back={pop} />
      <div className="page">
        {s && (
          <>
            <div className="card blue">
              <div className="row"><Ic icon={Gauge} tone="blue" size={44} /><div className="grow"><div className="sm muted">{t('Уровень')}</div><div className="skill-big">{s.level}<span className="h3 muted"> / {s.max_level}</span></div></div></div>
              <div className="bar blue"><i style={{ width: `${(s.purchases / s.max) * 100}%` }} /></div>
              <Kv k={t('Показатель навыка')} v={num(s.reaction)} c="var(--blue)" />
              <Kv k={t('Улучшений')} v={`${s.purchases} / ${s.max}`} />
              <Kv k={t('Вся прокачка')} v={money(s.total_cost)} />
              <div className="xs faint">{t('Показатель улучшается с 0,98 до 0,20 и прибавляется ко времени заезда: чем меньше, тем быстрее.')}</div>
            </div>
            {s.price1 != null ? (
              <div className="card">
                <Kv k={t('Следующее улучшение')} v={`${num(s.reaction)} → ${num(s.next_reaction)}`} />
                <button className="btn go xl w" disabled={busy || s.balance < s.price1} onClick={() => buy(1)}>{t('Улучшить')} · {money(s.price1)}</button>
                {s.price10 != null && <button className="btn info w" disabled={busy || s.balance < s.price10} onClick={() => buy(10)}>×10 → {num(s.reaction10)} · {money(s.price10)}</button>}
              </div>
            ) : <div className="card gold"><div className="h3 center">{t('Максимальный уровень!')}</div></div>}
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
      <AppBar title={t('Лидеры')} back={pop} />
      <div className="page">
        <Seg value={kind} onChange={setKind} options={[['balance', t('Деньги')], ['garage', t('Гараж')], ['wins', t('Аукцион')], ['racers', t('Гонки')]]} />
        <div className="card list">
          {list?.map((u, i) => (
            <div key={u.id} className="li"><span className="b num" style={{ width: 26, textAlign: 'center' }}>{['🥇', '🥈', '🥉'][i] ?? i + 1}</span><span className="grow"><Nick u={u} /></span>
              <b className="num">{kind === 'balance' || kind === 'garage' ? money(u.value) : u.value}</b></div>
          ))}
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
      <AppBar title={t('История операций')} back={pop} />
      <div className="page">
        {items && !items.length ? <Empty icon={History} title={t('Операций пока нет')} /> : (
          <div className="card list">
            {items?.map((h, i) => (
              <Li key={i} icon={h.delta > 0 ? TrendingUp : TrendingDown} tone={h.delta > 0 ? 'green' : 'red'} title={t(LEDGER[h.kind] ?? h.kind)}
                sub={ago(h.created_at)} right={<b className={`num ${h.delta > 0 ? 'c-green' : 'c-red'}`}>{h.delta > 0 ? '+' : ''}{money(h.delta)}</b>} />
            ))}
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
      <AppBar title={t('Друзья')} back={pop} />
      <div className="page">
        <div className="row g8">
          <input className="inp" placeholder={t('@username или ID')} value={add} onChange={(e) => setAdd(e.target.value)} />
          <button className="btn go" disabled={!add} onClick={async () => { try { await call('app_player', { action: 'add_friend', ref: add }); toast(t('Добавлен в друзья')); setAdd(''); load(); } catch (e) { toast(errorText(e)); } }}><UserPlus size={18} /></button>
        </div>
        {f && !f.friends.length ? <Empty icon={Users} title={t('Друзей пока нет')} text={t('Нажми на ник игрока и добавь его в друзья.')} /> : (
          <div className="card list">{f?.friends.map((x: any) => <div key={x.id} className="li"><span className="grow"><Nick u={x} size={30} /></span><span className="xs muted">{ago(x.last_seen)}</span></div>)}</div>
        )}
        <div className="card accent">
          <div className="h3">{t('Пригласить друга')}</div>
          <div className="sm muted">{t('Тебе {a}, другу {b}, за первую покупку друга ещё {c}. Каждые {n} друзей — эпическая машина.', { a: money(me.referral.inviter), b: money(me.referral.invited), c: money(me.referral.first_purchase), n: me.referral.epic_every })}</div>
          <button className="btn go w" disabled={!ref} onClick={() => ref && share(ref.link, t('Залетай на аукцион машин!'))}><Share2 size={18} /> {t('Пригласить')}</button>
          {ref?.list?.length > 0 && <div className="xs muted">{t('Приглашено: {n}', { n: ref.list.length })}</div>}
        </div>
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
      <AppBar title={t('Перевод')} back={pop} />
      <div className="page">
        <FriendPicker value={to} onPick={setTo} />
        <input className="inp" placeholder={t('@username или ID')} value={to} onChange={(e) => setTo(e.target.value)} />
        <input className="inp big" inputMode="numeric" placeholder="$0" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} />
        <div className="chips">{[5000, 25000, 50000, 250000].map((v) => <button key={v} className="chip" onClick={() => setAmount(String(v))}>{money(v)}</button>)}</div>
        <div className="card">
          <Kv k={t('Комиссия')} v={`${me.fees.transfer / 100}%`} />
          <Kv k={t('Получит')} v={money(net)} c="var(--green)" />
        </div>
        <button className="btn go xl w" disabled={busy || !to || !amount} onClick={async () => {
          setBusy(true);
          try { const r = await call('app_me', { action: 'transfer', to, amount: Number(amount), clientId: clientId() }); haptic('success'); toast(t('Переведено, получит {m}', { m: money(r.result.net) })); await reload(); pop(); }
          catch (e) { haptic('error'); toast(errorText(e)); }
          setBusy(false);
        }}><Send size={18} /> {t('Перевести')}</button>
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
      <AppBar title={t('Промокод')} back={pop} />
      <div className="page">
        <input className="inp big" placeholder={t('КОД')} value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ''))} />
        <button className="btn go xl w" disabled={busy || code.length < 3} onClick={async () => {
          setBusy(true);
          try { await call('app_me', { action: 'promo', code, clientId: clientId() }); haptic('success'); toast(t('Промокод активирован')); await reload(); pop(); }
          catch (e) { haptic('error'); toast(errorText(e)); }
          setBusy(false);
        }}>{t('Активировать')}</button>
      </div>
    </>
  );
}

// Сообщение разработчикам: проблема или идея. Ответ приходит в бота и виден здесь.
export function FeedbackPage() {
  const { pop } = useApp();
  const [kind, setKind] = useState<'bug' | 'idea'>('bug');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<any[] | null>(null);
  useEffect(() => { call('app_player', { action: 'my_feedback' }).then((r) => setList(r.list), () => setList([])); }, []);
  const send = async () => {
    if (busy) return;
    setBusy(true);
    try { const r = await call('app_player', { action: 'feedback', kind, text }); setList(r.list); setText(''); haptic('success'); toast(t('Спасибо! Ответ придёт в бота')); }
    catch (e) { haptic('error'); toast(errorText(e)); }
    setBusy(false);
  };
  return (
    <>
      <AppBar title={t('Обратная связь')} back={pop} />
      <div className="page">
        <Seg value={kind} onChange={setKind} options={[['bug', t('Проблема')], ['idea', t('Идея')]]} />
        <textarea className="inp area" maxLength={1000} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={kind === 'bug' ? t('Что случилось? Где и после чего — так быстрее починим.') : t('Что добавить или улучшить в игре?')} />
        <button className="btn go xl w" disabled={busy || text.trim().length < 5} onClick={send}>{t('Отправить')}</button>
        <div className="xs faint center">{t('Не больше 5 сообщений в сутки')}</div>
        {list && list.length > 0 && (
          <>
            <Sect>{t('Мои сообщения')}</Sect>
            <div className="card list">
              {list.map((f) => (
                <Li key={f.id} icon={f.kind === 'bug' ? Bug : Lightbulb} tone={f.kind === 'bug' ? 'red' : 'gold'}
                  title={<span style={{ whiteSpace: 'normal' }}>{f.text}</span>}
                  sub={f.answer ? <span className="c-green">{t('Ответ')}: {f.answer}</span> : `${ago(f.created_at)} · ${f.status === 'done' ? t('рассмотрено') : t('ждёт ответа')}`} />
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
