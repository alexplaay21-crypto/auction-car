import { useCallback, useEffect, useState } from 'react';
import { call, clientId, errorText, haptic, toast } from '../tg';
import { money, who, RARITY, RARITIES, LEDGER, ago } from '../format';
import { CarArt, ContainerArt, Sheet, dropImageVersions } from '../components';
import { AppBar } from '../ui';
import { useApp } from '../App';

const LABELS: Record<string, string> = {
  start_balance: 'Стартовый баланс', bet_step: 'Шаг ставки', auction_timer_s: 'Таймер контейнера, с', next_delay_s: 'Пауза между контейнерами, с',
  kick_after: 'Кик после N пропусков', max_players: 'Игроков в комнате', quick_sell_window_s: 'Окно быстрой продажи, с',
  chance_common: 'Шанс ⚪ обычной', chance_rare: 'Шанс 🔵 редкой', chance_epic: 'Шанс 🟣 эпической', chance_mythic: 'Шанс 🟡 легендарной', chance_mystic: 'Шанс 🔴 мистической',
  comm_quick_bps: 'Комиссия быстрой продажи, б.п.', comm_quick_vip_bps: '…для VIP', comm_state_bps: 'Комиссия продажи государству, б.п.', comm_state_vip_bps: '…для VIP',
  comm_player_bps: 'Комиссия продажи игроку, б.п.', comm_player_vip_bps: '…для VIP', comm_transfer_bps: 'Комиссия перевода, б.п.', comm_transfer_vip_bps: '…для VIP',
  daily_bonus: 'Бонус (раз в период)', daily_bonus_vip: 'Бонус VIP', bonus_period_s: 'Период бонуса, с', bonus_cap: 'Бонус только при балансе меньше', bonus_cap_vip: '…для VIP', vip_price: 'Цена VIP', garage_start: 'Гараж на старте', garage_max: 'Максимум гаража без VIP',
  garage_vip_bonus: 'Мест за VIP', ref_inviter: 'Бонус пригласившему', ref_invited: 'Бонус приглашённому', ref_first_purchase: 'За первую покупку друга',
  ref_epic_every: 'Эпик за каждые N друзей',
  race_min_stake: 'Гонка: мин. ставка', race_max_stake: 'Гонка: макс. ставка', race_bot_win_bps: 'Гонка с ботом: выигрыш, б.п.', race_pvp_fee_bps: 'Гонка PvP: комиссия, б.п.',
  bp_price: 'Battle Pass: цена премиума', bp_xp_level: 'Battle Pass: опыта на уровень', bp_levels: 'Battle Pass: уровней', bp_season: 'Battle Pass: сезон',
  price_floor_pct: 'Цена контейнера: минимум, % базы', price_cap_pct: 'Цена контейнера: максимум, % базы', price_step_pct: 'Цена контейнера: шаг за раз, %', sale_offer_ttl_s: 'Срок предложения игроку, с', min_transfer: 'Минимальный перевод', shop_enabled: 'Магазин включён (1/0)',
};

async function resizeImage(file: File): Promise<{ mime: string; data: string }> {
  const url = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
  const k = Math.min(1, 720 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  const out = c.toDataURL('image/jpeg', 0.82);
  return { mime: 'image/jpeg', data: out.split(',')[1] };
}

export function Admin() {
  const { pop: onBack } = useApp();
  const [tab, setTab] = useState('stats');
  const tabs = [['stats', 'Обзор'], ['feedback', 'Отзывы'], ['stars', 'Stars'], ['settings', 'Настройки'], ['cars', 'Машины'], ['containers', 'Контейнеры'], ['users', 'Игроки'], ['promo', 'Промо'], ['lots', 'Магазин'], ['bp', 'Battle Pass'], ['rooms', 'Комнаты']];
  return (
    <>
    <AppBar title="Админ-панель" back={onBack} />
    <div className="page">
      <div className="chips">{tabs.map(([k, l]) => <button key={k} className={`chip${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'stats' && <Stats />}
      {tab === 'settings' && <Settings />}
      {(tab === 'cars' || tab === 'containers') && <Catalog mode={tab} />}
      {tab === 'users' && <Users />}
      {tab === 'promo' && <Promo />}
      {tab === 'lots' && <Lots />}
      {tab === 'bp' && <BpSeasons />}
      {tab === 'feedback' && <Feedback />}
      {tab === 'stars' && <Stars />}
      {tab === 'rooms' && <Rooms />}
    </div>
    </>
  );
}

const adm = (input: any) => call('app_admin', { clientId: clientId(), ...input });
async function doAdm(input: any, ok = 'Сохранено') {
  try { const r = await adm(input); haptic('success'); toast(ok); return r; } catch (e) { haptic('error'); toast(errorText(e)); return null; }
}

function Stats() {
  const [s, setS] = useState<any>(null);
  useEffect(() => { adm({ action: 'stats' }).then(setS, (e) => toast(errorText(e))); }, []);
  if (!s) return <div className="hint">Загрузка…</div>;
  return (
    <>
      <div className="grid stats-grid">
        {[['Игроков', s.users], ['Активны за сутки', s.active_day], ['Денег у игроков', money(s.money)], ['Машин в гаражах', s.cars_owned],
          ['Открытых комнат', s.rooms_open], ['Контейнеров за сутки', s.auctions_day], ['Продано за сутки', `${s.won_day.n} · ${money(s.won_day.sum)}`]]
          .map(([l, v]) => <div key={String(l)} className="glass tile"><div className="hint small">{l}</div><b>{v}</b></div>)}
      </div>
      <div><h3>Журнал действий</h3>
        <div className="glass list">{s.log.map((l: any) => <div key={l.id} className="top-row small"><span className="grow">{l.action} <span className="hint">{l.details}</span></span><span className="hint">{who({ username: l.username })} · {ago(l.created_at)}</span></div>)}</div>
      </div>
    </>
  );
}

function Settings() {
  const [s, setS] = useState<any>(null);
  const [edit, setEdit] = useState<Record<string, string>>({});
  useEffect(() => { adm({ action: 'settings' }).then(setS, (e) => toast(errorText(e))); }, []);
  if (!s) return <div className="hint">Загрузка…</div>;
  return (
    <div className="glass list">
      <div className="hint small">1 б.п. = 0,01%: 1000 б.п. = 10%. Шансы — относительные веса.</div>
      {s.keys.map((k: string) => (
        <div key={k} className="set-row">
          <span className="grow small">{LABELS[k] ?? k}</span>
          <input className="field mini" inputMode="numeric" value={edit[k] ?? String(s.values[k] ?? '')} onChange={(e) => setEdit({ ...edit, [k]: e.target.value.replace(/\D/g, '') })} />
          {edit[k] != null && edit[k] !== String(s.values[k]) && (
            <button className="btn small primary" onClick={async () => { if (await doAdm({ action: 'set', k, v: Number(edit[k]) })) { s.values[k] = Number(edit[k]); const e2 = { ...edit }; delete e2[k]; setEdit(e2); } }}>✓</button>
          )}
        </div>
      ))}
    </div>
  );
}

function Catalog({ mode }: { mode: string }) {
  const [c, setC] = useState<any>(null);
  const [car, setCar] = useState<any>(null);
  const [ct, setCt] = useState<any>(null);
  const [pool, setPool] = useState<Record<number, number>>({});
  const load = useCallback(() => adm({ action: 'catalog' }).then(setC, (e) => toast(errorText(e))), []);
  useEffect(() => { load(); }, [load]);
  if (!c) return <div className="hint">Загрузка…</div>;

  const upload = async (kind: string, id: number, file?: File | null) => {
    if (!file || !id) return;
    try {
      const img = await resizeImage(file);
      if (await doAdm({ action: 'image', kind, id, ...img }, 'Фото загружено')) { dropImageVersions(); load(); }
    } catch { toast('Не удалось прочитать фото'); }
  };
  const editCt = (x: any) => {
    setCt({ ...x });
    setPool(Object.fromEntries(c.pools.filter((p: any) => p.container_id === x.id).map((p: any) => [p.car_id, p.weight])));
  };

  if (mode === 'cars') return (
    <>
      <button className="btn primary wide" onClick={() => setCar({ name: '', rarity: 'common', max_speed: 200, accel_x100: 900, power: 150, handling: 60, reliability: 80, price: 3000, body: 'sedan', color: '#888888', is_active: 1 })}>+ Новая машина</button>
      <div className="glass list">
        {c.cars.map((x: any) => (
          <button key={x.id} className="top-row btn-reset" onClick={() => setCar({ ...x })}>
            <span>{RARITY[x.rarity]?.icon}</span><span className="grow">{x.name}{x.is_active ? '' : ' (выкл)'}</span><b>{money(x.price)}</b>
          </button>
        ))}
      </div>
      <Sheet open={!!car} onClose={() => setCar(null)} title={car?.id ? 'Машина' : 'Новая машина'}>
        {car && (
          <div className="form">
            <CarArt car={car} height={90} />
            {car.id && <label className="btn ghost wide">📷 Загрузить фото<input type="file" accept="image/*" hidden onChange={(e) => upload('car', car.id, e.target.files?.[0])} /></label>}
            <F label="Название" v={car.name} on={(v) => setCar({ ...car, name: v })} />
            <F label="Страна" v={car.country ?? ''} on={(v) => setCar({ ...car, country: v })} />
            <div className="chips">{RARITIES.map((r) => <button key={r} className={`chip${car.rarity === r ? ' on' : ''}`} onClick={() => setCar({ ...car, rarity: r })}>{RARITY[r].icon} {RARITY[r].name}</button>)}</div>
            <div className="chips">{['sedan', 'hatch', 'coupe', 'super', 'wagon', 'suv'].map((b) => <button key={b} className={`chip${car.body === b ? ' on' : ''}`} onClick={() => setCar({ ...car, body: b })}>{b}</button>)}</div>
            <F label="Цена" v={car.price} num on={(v) => setCar({ ...car, price: v })} />
            <F label="Скорость, км/ч" v={car.max_speed} num on={(v) => setCar({ ...car, max_speed: v })} />
            <F label="Разгон 0–100 ×100 (450 = 4,5 с)" v={car.accel_x100} num on={(v) => setCar({ ...car, accel_x100: v })} />
            <F label="Мощность, л.с." v={car.power} num on={(v) => setCar({ ...car, power: v })} />
            <F label="Управляемость 0–100" v={car.handling} num on={(v) => setCar({ ...car, handling: v })} />
            <F label="Надёжность 0–100" v={car.reliability} num on={(v) => setCar({ ...car, reliability: v })} />
            <label className="frow"><span>Цвет</span><input type="color" value={car.color ?? '#888888'} onChange={(e) => setCar({ ...car, color: e.target.value })} /></label>
            <label className="frow"><span>Активна (выпадает)</span><input type="checkbox" checked={car.is_active !== 0} onChange={(e) => setCar({ ...car, is_active: e.target.checked ? 1 : 0 })} /></label>
            <button className="btn primary wide" onClick={async () => { if (await doAdm({ action: 'save_car', car })) { setCar(null); load(); } }}>Сохранить</button>
          </div>
        )}
      </Sheet>
    </>
  );

  return (
    <>
      <button className="btn primary wide" onClick={() => editCt({ name: '', price: 5000, emoji: '📦', is_enabled: 1 })}>+ Новый контейнер</button>
      {c.containers.map((x: any) => (
        <button key={x.id} className="glass row-card btn-reset" onClick={() => editCt(x)}>
          <ContainerArt c={x} size={40} />
          <div className="grow"><b>{x.name}{x.is_enabled ? '' : ' (выкл)'}</b><div className="hint small">старт {money(x.price)} · машин: {c.pools.filter((p: any) => p.container_id === x.id).length}</div></div>
        </button>
      ))}
      <Sheet open={!!ct} onClose={() => setCt(null)} title={ct?.id ? 'Контейнер' : 'Новый контейнер'}>
        {ct && (
          <div className="form">
            {ct.id && <label className="btn ghost wide">📷 Загрузить фото<input type="file" accept="image/*" hidden onChange={(e) => upload('container', ct.id, e.target.files?.[0])} /></label>}
            <F label="Название" v={ct.name} on={(v) => setCt({ ...ct, name: v })} />
            <F label="Страна" v={ct.country ?? ''} on={(v) => setCt({ ...ct, country: v })} />
            <F label="Эмодзи" v={ct.emoji ?? ''} on={(v) => setCt({ ...ct, emoji: v })} />
            <div className="chips">{[['us', 'США'], ['ru', 'Россия'], ['jp', 'Япония'], ['cn', 'Китай'], ['de', 'Германия'], ['fr', 'Франция'], ['it', 'Италия'], ['world', 'Мир']].map(([f, l]) => (
              <button key={f} className={`chip${ct.flag === f ? ' on' : ''}`} onClick={() => setCt({ ...ct, flag: f })}>{l}</button>))}</div>
            <F label="Стартовая цена" v={ct.price} num on={(v) => setCt({ ...ct, price: v })} />
            <div className="hint small">Свои шансы (пусто — общие из настроек):</div>
            {RARITIES.map((r) => <F key={r} label={`${RARITY[r].icon} ${RARITY[r].name}`} v={ct['chance_' + r] ?? ''} num on={(v) => setCt({ ...ct, ['chance_' + r]: v === '' ? null : v })} />)}
            <label className="frow"><span>Включён</span><input type="checkbox" checked={ct.is_enabled !== 0} onChange={(e) => setCt({ ...ct, is_enabled: e.target.checked ? 1 : 0 })} /></label>
            <div className="hint small">Машины в контейнере (вес внутри своей редкости):</div>
            <div className="list">
              {c.cars.map((x: any) => (
                <div key={x.id} className="set-row">
                  <input type="checkbox" checked={pool[x.id] != null} onChange={(e) => { const p = { ...pool }; if (e.target.checked) p[x.id] = 1; else delete p[x.id]; setPool(p); }} />
                  <span className="grow small">{RARITY[x.rarity]?.icon} {x.name}</span>
                  {pool[x.id] != null && <input className="field mini" inputMode="numeric" value={pool[x.id]} onChange={(e) => setPool({ ...pool, [x.id]: Number(e.target.value.replace(/\D/g, '')) || 0 })} />}
                </div>
              ))}
            </div>
            <button className="btn primary wide" onClick={async () => {
              if (await doAdm({ action: 'save_container', container: ct, pool: Object.entries(pool).map(([car_id, weight]) => ({ car_id: Number(car_id), weight })) })) { setCt(null); load(); }
            }}>Сохранить</button>
          </div>
        )}
      </Sheet>
    </>
  );
}

function F({ label, v, on, num }: { label: string; v: any; on: (v: any) => void; num?: boolean }) {
  return (
    <label className="frow"><span>{label}</span>
      <input className="field" inputMode={num ? 'numeric' : undefined} value={v ?? ''} onChange={(e) => on(num ? (e.target.value === '' ? '' : Number(e.target.value.replace(/\D/g, ''))) : e.target.value)} />
    </label>
  );
}

function Users() {
  const [q, setQ] = useState('');
  const [list, setList] = useState<any[]>([]);
  const [u, setU] = useState<any>(null);
  const [delta, setDelta] = useState('');
  const [catalog, setCatalog] = useState<any>(null);
  const search = useCallback(() => adm({ action: 'users', q }).then((r) => setList(r.list), (e) => toast(errorText(e))), [q]);
  useEffect(() => { search(); adm({ action: 'catalog' }).then(setCatalog, () => {}); }, []); // eslint-disable-line
  const open = (id: number) => adm({ action: 'user', id }).then(setU, (e) => toast(errorText(e)));
  return (
    <>
      <div className="glass row-card">
        <input className="field grow" placeholder="ID, @username или имя" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
        <button className="btn primary" onClick={search}>Найти</button>
      </div>
      <div className="glass list">
        {list.map((x) => (
          <button key={x.id} className="top-row btn-reset" onClick={() => open(x.id)}>
            <span className="grow">{who(x)} {x.is_vip ? '👑' : ''}{x.is_banned ? ' ⛔' : ''}{x.is_admin ? ' 🛠' : ''}<div className="hint small">{x.id}</div></span><b>{money(x.balance)}</b>
          </button>
        ))}
      </div>
      <Sheet open={!!u} onClose={() => setU(null)} title={u ? who(u.user) : ''}>
        {u && (
          <div className="form">
            <div className="hint small">ID {u.user.id} · баланс {money(u.user.balance)} · гараж {u.cars.length}/{u.user.garage_capacity}</div>
            <div className="row-gap">
              <input className="field grow" inputMode="numeric" placeholder="+/- сумма" value={delta} onChange={(e) => setDelta(e.target.value.replace(/[^\d-]/g, ''))} />
              <button className="btn primary" onClick={async () => { if (await doAdm({ action: 'adjust', id: u.user.id, delta: Number(delta), reason: 'админка' })) { setDelta(''); open(u.user.id); } }}>Изменить баланс</button>
            </div>
            <div className="row-gap">
              <button className="btn" onClick={async () => { await doAdm({ action: 'vip', id: u.user.id, grant: !u.user.is_vip }); open(u.user.id); }}>{u.user.is_vip ? 'Снять VIP' : 'Выдать VIP'}</button>
              <button className="btn" onClick={async () => { await doAdm({ action: 'ban', id: u.user.id, ban: !u.user.is_banned, reason: 'админка' }); open(u.user.id); }}>{u.user.is_banned ? 'Разбанить' : 'Забанить'}</button>
              <button className="btn" onClick={async () => { await doAdm({ action: 'set_admin', to: String(u.user.id), admin: !u.user.is_admin }); open(u.user.id); }}>{u.user.is_admin ? 'Снять админа' : 'Сделать админом'}</button>
            </div>
            {catalog && (
              <div className="row-gap">
                <select className="field grow" id="give-car">{catalog.cars.map((x: any) => <option key={x.id} value={x.id}>{RARITY[x.rarity]?.icon} {x.name}</option>)}</select>
                <button className="btn" onClick={async () => { const v = (document.getElementById('give-car') as HTMLSelectElement).value; await doAdm({ action: 'give_car', id: u.user.id, car_id: Number(v) }, 'Машина выдана'); open(u.user.id); }}>Выдать машину</button>
              </div>
            )}
            {catalog && (
              <div className="row-gap">
                <select className="field grow" id="give-ct">{catalog.containers.map((x: any) => <option key={x.id} value={x.id}>{x.emoji} {x.name}</option>)}</select>
                <button className="btn" onClick={async () => { const v = (document.getElementById('give-ct') as HTMLSelectElement).value; await doAdm({ action: 'give_container', id: u.user.id, container_id: Number(v), qty: 1 }, 'Контейнер выдан'); }}>Выдать контейнер</button>
              </div>
            )}
            <h3>Машины</h3>
            <div className="list">{u.cars.map((x: any) => <div key={x.id} className="top-row small"><span className="grow">{RARITY[x.rarity]?.icon} {x.name}</span><b>{money(x.price)}</b></div>)}</div>
            <h3>Операции</h3>
            <div className="list">{u.ledger.map((x: any, i: number) => <div key={i} className="top-row small"><span className="grow">{LEDGER[x.kind] ?? x.kind}<span className="hint"> · {ago(x.created_at)}</span></span><b className={x.delta > 0 ? 'up' : 'down'}>{money(x.delta)}</b></div>)}</div>
          </div>
        )}
      </Sheet>
    </>
  );
}

function Promo() {
  const [list, setList] = useState<any[]>([]);
  const [p, setP] = useState<any>({ code: '', money: 1000, container_id: '', container_qty: 0, vip: false, max_uses: 100, days: 30 });
  const load = useCallback(() => adm({ action: 'promos' }).then((r) => setList(r.list), (e) => toast(errorText(e))), []);
  useEffect(() => { load(); }, [load]);
  return (
    <>
      <div className="glass form">
        <F label="Код" v={p.code} on={(v) => setP({ ...p, code: String(v).toUpperCase() })} />
        <F label="Деньги" v={p.money} num on={(v) => setP({ ...p, money: v })} />
        <F label="ID контейнера" v={p.container_id} num on={(v) => setP({ ...p, container_id: v })} />
        <F label="Сколько контейнеров" v={p.container_qty} num on={(v) => setP({ ...p, container_qty: v })} />
        <F label="Активаций (пусто — без лимита)" v={p.max_uses} num on={(v) => setP({ ...p, max_uses: v })} />
        <F label="Действует дней (пусто — бессрочно)" v={p.days} num on={(v) => setP({ ...p, days: v })} />
        <label className="frow"><span>Выдаёт VIP</span><input type="checkbox" checked={p.vip} onChange={(e) => setP({ ...p, vip: e.target.checked })} /></label>
        <button className="btn primary wide" onClick={async () => { if (await doAdm({ action: 'save_promo', promo: p }, 'Промокод создан')) load(); }}>Создать</button>
      </div>
      <div className="glass list">
        {list.map((x) => (
          <div key={x.code} className="top-row">
            <span className="grow"><b>{x.code}</b>{x.is_active ? '' : ' (выкл)'}<div className="hint small">{x.money ? money(x.money) : ''} {x.container_qty ? `📦×${x.container_qty}` : ''} {x.vip ? '👑' : ''} · {x.uses}/{x.max_uses ?? '∞'}</div></span>
            <button className="btn small ghost" onClick={async () => { await doAdm({ action: 'toggle_promo', code: x.code, active: !x.is_active }); load(); }}>{x.is_active ? 'Выкл' : 'Вкл'}</button>
          </div>
        ))}
      </div>
    </>
  );
}

function Lots() {
  const [list, setList] = useState<any[]>([]);
  const [l, setL] = useState<any>(null);
  const load = useCallback(() => adm({ action: 'lots' }).then((r) => setList(r.list), (e) => toast(errorText(e))), []);
  useEffect(() => { load(); }, [load]);
  return (
    <>
      <button className="btn primary wide" onClick={() => setL({ title: '', price: 10000, money: 0, container_id: '', container_qty: 1, vip: false, is_available: 1, sort: 0 })}>+ Новый лот</button>
      <div className="glass list">
        {list.map((x) => <button key={x.id} className="top-row btn-reset" onClick={() => setL({ ...x, vip: !!x.vip })}><span className="grow">{x.title}{x.is_available ? '' : ' (скрыт)'}</span><b>{money(x.price)}</b></button>)}
      </div>
      <Sheet open={!!l} onClose={() => setL(null)} title="Лот магазина">
        {l && (
          <div className="form">
            <F label="Название" v={l.title} on={(v) => setL({ ...l, title: v })} />
            <F label="Описание" v={l.description ?? ''} on={(v) => setL({ ...l, description: v })} />
            <F label="Цена" v={l.price} num on={(v) => setL({ ...l, price: v })} />
            <F label="Деньги в лоте" v={l.money} num on={(v) => setL({ ...l, money: v })} />
            <F label="ID контейнера" v={l.container_id ?? ''} num on={(v) => setL({ ...l, container_id: v })} />
            <F label="Сколько контейнеров" v={l.container_qty} num on={(v) => setL({ ...l, container_qty: v })} />
            <F label="ID машины" v={l.car_id ?? ''} num on={(v) => setL({ ...l, car_id: v })} />
            <F label="Лимит на игрока" v={l.per_user_limit ?? ''} num on={(v) => setL({ ...l, per_user_limit: v })} />
            <F label="Порядок" v={l.sort} num on={(v) => setL({ ...l, sort: v })} />
            <label className="frow"><span>Выдаёт VIP</span><input type="checkbox" checked={!!l.vip} onChange={(e) => setL({ ...l, vip: e.target.checked })} /></label>
            <label className="frow"><span>В продаже</span><input type="checkbox" checked={l.is_available !== 0} onChange={(e) => setL({ ...l, is_available: e.target.checked ? 1 : 0 })} /></label>
            <button className="btn primary wide" onClick={async () => { if (await doAdm({ action: 'save_lot', lot: l })) { setL(null); load(); } }}>Сохранить</button>
          </div>
        )}
      </Sheet>
    </>
  );
}

function Rooms() {
  const [list, setList] = useState<any[]>([]);
  const load = useCallback(() => adm({ action: 'rooms' }).then((r) => setList(r.list), (e) => toast(errorText(e))), []);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="glass list">
      {!list.length && <div className="hint">Открытых комнат нет</div>}
      {list.map((r) => (
        <div key={r.id} className="top-row">
          <span className="grow">№{r.number} · {r.scope === 'group' ? 'группа' : 'общая'}<div className="hint small">{r.players} игроков{r.bid ? ` · ставка ${money(r.bid)}` : ''}{r.stop_requested ? ' · остановка' : ''}</div></span>
          {r.bid != null && <button className="btn small ghost" onClick={async () => { await doAdm({ action: 'cancel_auction', roomId: r.id }, 'Контейнер отменён, ставка возвращена'); load(); }}>Отменить</button>}
          <button className="btn small ghost" onClick={async () => { await doAdm({ action: 'stop_room', roomId: r.id }, 'Комната остановится'); load(); }}>Стоп</button>
        </div>
      ))}
    </div>
  );
}

const KINDS: [string, string][] = [['money', 'Деньги'], ['container', 'Контейнер (ID)'], ['skill', 'Навык +N'], ['car', 'Случайная (1 редкая · 2 эпическая)'], ['model', 'Конкретная машина (ID)']];
function BpSeasons() {
  const [d, setD] = useState<any>(null);
  const [form, setForm] = useState<any>(null);
  const [lv, setLv] = useState<any>(null);
  const load = useCallback(() => adm({ action: 'bp_seasons' }).then(setD, (e) => toast(errorText(e))), []);
  useEffect(() => { load(); }, [load]);
  if (!d) return <div className="hint">Загрузка…</div>;
  const cur = d.current;
  const daysLeft = cur ? Math.max(0, Math.ceil((cur.ends_at - d.now) / 86400)) : 0;
  const cname = (id: number) => d.containers.find((c: any) => c.id === id)?.name ?? `#${id}`;
  const carName = (id: number) => d.cars.find((c: any) => c.id === id)?.name ?? `#${id}`;
  const rw = (k: string, v: number) => k === 'money' ? money(v) : k === 'container' ? `📦 ${cname(v)}` : k === 'skill' ? `навык +${v}` : k === 'model' ? `🚗 ${carName(v)}` : `🚗 ${['', 'редкая', 'эпик', 'легенд'][v]}`;

  return (
    <>
      <div className="glass list">
        {cur ? <div className="top-row"><span className="grow"><b>{cur.name}</b><div className="hint small">идёт · осталось {daysLeft} дн. · {cur.levels} ур. · премиум {money(cur.price)}</div></span>
          <button className="btn small ghost" onClick={async () => { if (confirm('Завершить сезон сейчас?') && await doAdm({ action: 'bp_end', season: cur.id }, 'Сезон завершён')) load(); }}>Завершить</button></div>
          : <div className="hint">Сезон сейчас не идёт</div>}
      </div>
      {cur && (
        <div><h3>Машины сезона</h3>
          <div className="hint small">Выдаются сразу при покупке. За премиум — до эпической, легендарная — только за делюкс.</div>
          {([['premium', 'За премиум', cur.prem_car_id, (c: any) => c.rarity !== 'mythic'], ['deluxe', 'За делюкс', cur.dx_car_id, (c: any) => c.rarity === 'mythic']] as const).map(([track, label, val, ok]) => (
            <label key={track} className="frow"><span>{label}</span>
              <select className="field" value={val ?? ''} onChange={async (e) => { if (await doAdm({ action: 'bp_car', season: cur.id, track, car_id: e.target.value ? Number(e.target.value) : null }, 'Машина сезона сохранена')) load(); }}>
                <option value="">— без машины —</option>
                {d.cars.filter(ok).map((c: any) => <option key={c.id} value={c.id}>{RARITY[c.rarity]?.icon} {c.name}</option>)}
              </select>
            </label>
          ))}
        </div>
      )}
      <button className="btn primary wide" onClick={() => setForm({ name: `Сезон ${(d.seasons[0]?.id ?? 0) + 1}`, days: 21, price: cur?.price ?? 150000, levels: 14, xp_level: cur?.xp_level ?? 1000 })}>+ Новый сезон (21 день)</button>
      {cur && <div><h3>Награды текущего сезона</h3>
        <div className="glass list">{d.levels.map((l: any) => (
          <button key={l.level} className="top-row btn-reset small" onClick={() => setLv({ ...l, track: 'free', kind: l.free_kind, value: l.free_value })}>
            <b style={{ width: 24 }}>{l.level}</b><span className="grow">{rw(l.free_kind, l.free_value)}</span><span className="c-gold">{rw(l.prem_kind, l.prem_value)}</span>
          </button>))}</div></div>}
      <div><h3>История</h3>
        <div className="glass list">{d.seasons.map((x: any) => <div key={x.id} className="top-row small"><span className="grow">{x.name}</span><span className="hint">{new Date(x.starts_at * 1000).toLocaleDateString('ru-RU')} — {new Date(x.ends_at * 1000).toLocaleDateString('ru-RU')}</span></div>)}</div>
      </div>
      <Sheet open={!!form} onClose={() => setForm(null)} title="Новый сезон">
        {form && (
          <div className="form">
            <div className="hint small">Текущий сезон завершится, награды скопируются из него — потом их можно поменять.</div>
            <F label="Название" v={form.name} on={(v) => setForm({ ...form, name: v })} />
            <F label="Длительность, дней" v={form.days} num on={(v) => setForm({ ...form, days: v })} />
            <F label="Цена премиума" v={form.price} num on={(v) => setForm({ ...form, price: v })} />
            <F label="Уровней" v={form.levels} num on={(v) => setForm({ ...form, levels: v })} />
            <F label="Опыта на уровень" v={form.xp_level} num on={(v) => setForm({ ...form, xp_level: v })} />
            <button className="btn primary wide" onClick={async () => { if (await doAdm({ action: 'bp_create', ...form }, 'Сезон запущен')) { setForm(null); load(); } }}>Запустить сезон</button>
          </div>
        )}
      </Sheet>
      <Sheet open={!!lv} onClose={() => setLv(null)} title={lv ? `Уровень ${lv.level}` : ''}>
        {lv && (
          <div className="form">
            <div className="chips">{[['free', 'Бесплатно'], ['premium', 'Премиум']].map(([k, l]) => <button key={k} className={`chip${lv.track === k ? ' on' : ''}`}
              onClick={() => setLv({ ...lv, track: k, kind: k === 'free' ? lv.free_kind : lv.prem_kind, value: k === 'free' ? lv.free_value : lv.prem_value })}>{l}</button>)}</div>
            <div className="chips">{KINDS.map(([k, l]) => <button key={k} className={`chip${lv.kind === k ? ' on' : ''}`} onClick={() => setLv({ ...lv, kind: k })}>{l}</button>)}</div>
            <F label="Значение" v={lv.value} num on={(v) => setLv({ ...lv, value: v })} />
            {lv.kind === 'container' && <div className="hint small">{d.containers.map((c: any) => `${c.id} — ${c.name}`).join(' · ')}</div>}
            {lv.kind === 'model' && (
              <select className="field" value={lv.value ?? ''} onChange={(e) => setLv({ ...lv, value: Number(e.target.value) })}>
                <option value="">— выбери машину —</option>
                {d.cars.filter((c: any) => c.rarity !== 'mythic').map((c: any) => <option key={c.id} value={c.id}>{RARITY[c.rarity]?.icon} {c.name}</option>)}
              </select>
            )}
            <button className="btn primary wide" onClick={async () => { if (await doAdm({ action: 'bp_reward', season: cur.id, level: lv.level, track: lv.track, kind: lv.kind, value: lv.value })) { setLv(null); load(); } }}>Сохранить</button>
          </div>
        )}
      </Sheet>
    </>
  );
}

function Feedback() {
  const [status, setStatus] = useState('new');
  const [d, setD] = useState<any>(null);
  const [open, setOpen] = useState<any>(null);
  const [answer, setAnswer] = useState('');
  const load = useCallback(() => adm({ action: 'feedback', status }).then(setD, (e) => toast(errorText(e))), [status]);
  useEffect(() => { load(); }, [load]);
  return (
    <>
      <div className="chips">{[['new', `Новые${d ? ` · ${d.open}` : ''}`], ['done', 'Отвеченные'], ['all', 'Все']].map(([k, l]) => <button key={k} className={`chip${status === k ? ' on' : ''}`} onClick={() => setStatus(k)}>{l}</button>)}</div>
      <div className="glass list">
        {d && !d.list.length && <div className="hint">Пусто</div>}
        {d?.list.map((f: any) => (
          <button key={f.id} className="top-row btn-reset" onClick={() => { setOpen(f); setAnswer(f.answer ?? ''); }}>
            <span>{f.kind === 'bug' ? '🐞' : '💡'}</span>
            <span className="grow" style={{ whiteSpace: 'normal' }}>{f.text}<div className="hint small">{who(f)} · {ago(f.created_at)}{f.answer ? ' · ✅ отвечено' : ''}</div></span>
          </button>
        ))}
      </div>
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open ? `${open.kind === 'bug' ? '🐞 Проблема' : '💡 Идея'} №${open.id}` : ''}>
        {open && (
          <div className="form">
            <div className="hint small">{who(open)} · id {open.user_id} · {ago(open.created_at)}</div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{open.text}</div>
            <textarea className="inp area" placeholder="Ответ игроку (придёт в бота)" value={answer} onChange={(e) => setAnswer(e.target.value)} />
            <button className="btn primary wide" disabled={!answer.trim()} onClick={async () => { if (await doAdm({ action: 'feedback_answer', id: open.id, answer }, 'Ответ отправлен')) { setOpen(null); load(); } }}>Ответить</button>
            {open.status === 'new' && <button className="btn ghost wide" onClick={async () => { if (await doAdm({ action: 'feedback_answer', id: open.id }, 'Отмечено')) { setOpen(null); load(); } }}>Отметить без ответа</button>}
          </div>
        )}
      </Sheet>
    </>
  );
}

const STAR_KIND: Record<string, string> = { money: 'Валюта', vip: 'VIP', bp: 'Премиум Battle Pass', bpdx: 'Battle Pass Делюкс', bplvl: 'Уровень Battle Pass', refund: 'Возврат' };
function Stars() {
  const [d, setD] = useState<any>(null);
  const [p, setP] = useState<any>(null);
  const load = useCallback(() => adm({ action: 'stars' }).then(setD, (e) => toast(errorText(e))), []);
  useEffect(() => { load(); }, [load]);
  if (!d) return <div className="hint">Загрузка…</div>;
  return (
    <>
      <div className="glass tile"><div className="hint small">Покупок за звёзды</div><b>{d.total.n} · ⭐ {d.total.stars}</b></div>
      <div><h3>Товары</h3>
        <div className="glass list">{d.products.map((x: any) => (
          <button key={x.id} className="top-row btn-reset" onClick={() => setP({ ...x })}>
            <span className="grow">{STAR_KIND[x.kind]}{x.kind === 'money' ? ` ${money(x.money)}` : ''}{x.is_active ? '' : ' (скрыт)'}<div className="hint small">{x.kind === 'money' ? `${Math.round(x.money / x.stars)} $ за звезду` : x.id}</div></span><b>⭐ {x.stars}</b>
          </button>))}</div>
      </div>
      <div><h3>Последние покупки</h3>
        <div className="glass list">{!d.recent.length && <div className="hint">Пока нет</div>}{d.recent.map((r: any) => (
          <div key={r.charge_id} className="top-row small"><span className="grow">{who(r)} · {STAR_KIND[r.kind] ?? r.kind}{r.money ? ` ${money(r.money)}` : ''}</span><span className="hint">⭐ {r.stars} · {ago(r.created_at)}</span></div>))}</div>
      </div>
      <Sheet open={!!p} onClose={() => setP(null)} title={p ? STAR_KIND[p.kind] : ''}>
        {p && (
          <div className="form">
            <F label="Цена, звёзд" v={p.stars} num on={(v) => setP({ ...p, stars: v })} />
            {p.kind === 'money' && <F label="Сколько денег" v={p.money} num on={(v) => setP({ ...p, money: v })} />}
            <label className="frow"><span>В продаже</span><input type="checkbox" checked={!!p.is_active} onChange={(e) => setP({ ...p, is_active: e.target.checked ? 1 : 0 })} /></label>
            <button className="btn primary wide" onClick={async () => { if (await doAdm({ action: 'save_star_product', product: p })) { setP(null); load(); } }}>Сохранить</button>
          </div>
        )}
      </Sheet>
    </>
  );
}
