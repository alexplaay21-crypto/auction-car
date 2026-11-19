import { useEffect, useState } from 'react';
import { call, clientId, errorText, haptic, share, toast } from '../tg';
import { money, who, ago, LEDGER, RARITY } from '../format';
import { Avatar, Money, Sheet } from '../components';

export function Profile({ p, reload, onAdmin }: { p: any; reload: () => void; onAdmin: () => void }) {
  const [tab, setTab] = useState<'stats' | 'top' | 'friends' | 'history'>('stats');
  const [send, setSend] = useState(false);
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [top, setTop] = useState<any>(null);
  const [topKind, setTopKind] = useState('balance');
  const [friends, setFriends] = useState<any>(null);
  const [hist, setHist] = useState<any[] | null>(null);

  useEffect(() => {
    if (tab === 'top') call('app_shop', { action: 'top', kind: topKind }).then(setTop, () => {});
    if (tab === 'friends' && !friends) call('app_me', { action: 'referrals' }).then(setFriends, () => {});
    if (tab === 'history') call('app_me', { action: 'history' }).then((r) => setHist(r.items), () => {});
  }, [tab, topKind, friends]);

  const run = async (input: any, ok: (r: any) => string) => {
    if (busy) return;
    setBusy(true);
    try { const r = await call('app_me', { clientId: clientId(), ...input }); haptic('success'); toast(ok(r.result)); reload(); }
    catch (e) { haptic('error'); toast(errorText(e)); }
    setBusy(false);
  };

  const s = p.stats;
  return (
    <div className="page">
      <div className="glass profile-head">
        <Avatar u={p.user} size={64} />
        <div className="grow">
          <div className="name">{who(p.user)} {p.user.is_vip ? <span className="vip-badge">👑 VIP</span> : null}</div>
          <Money value={p.balance} className="big-num" />
          <div className="hint small">Место в рейтинге #{p.place} · гараж {p.garage.owned}/{p.garage.capacity}</div>
        </div>
      </div>
      <div className="actions">
        <button className={`btn${p.bonus.available ? ' primary glow' : ''}`} disabled={busy || !p.bonus.available} onClick={() => run({ action: 'bonus' }, (r) => `+${money(r.amount)}`)}>
          🎁 {p.bonus.available ? `Бонус ${money(p.bonus.amount)}` : 'Бонус завтра'}
        </button>
        <button className="btn" onClick={() => setSend(true)}>💸 Перевести</button>
        {p.user.is_admin ? <button className="btn" onClick={onAdmin}>🛠 Админка</button> : null}
      </div>

      <div className="chips">
        {[['stats', 'Статистика'], ['top', 'Лидеры'], ['friends', 'Друзья'], ['history', 'История']].map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k as any)}>{l}</button>
        ))}
      </div>

      {tab === 'stats' && (
        <div className="glass stats">
          {[
            ['📦 Открыто контейнеров', s.containers_opened], ['🏆 Побед на аукционе', s.wins], ['💵 Ставок', s.bids_made],
            ['🚗 Получено машин', s.cars_obtained], ['🔁 Продано машин', s.cars_sold], ['📈 Заработано', money(s.earned_total)],
            ['📉 Потрачено на контейнеры', money(s.spent_total)], ['🅿️ Стоимость гаража', money(p.garage.value)], ['👥 Друзей', s.referrals],
          ].map(([l, v]) => <div key={String(l)} className="stat-row"><span>{l}</span><b>{v}</b></div>)}
          {p.best && <div className="stat-row"><span>⭐ Лучшая машина</span><b>{RARITY[p.best.rarity]?.icon} {p.best.name}</b></div>}
          <div className="hint small">Комиссии: быстрая продажа {p.fees.quick / 100}% · государству {p.fees.state / 100}% · игроку {p.fees.player / 100}% · перевод {p.fees.transfer / 100}%</div>
        </div>
      )}

      {tab === 'top' && (
        <>
          <div className="chips small">
            {[['balance', '💰 Баланс'], ['garage', '🚗 Гараж'], ['wins', '🏆 Победы']].map(([k, l]) => <button key={k} className={topKind === k ? 'on' : ''} onClick={() => setTopKind(k)}>{l}</button>)}
          </div>
          <div className="glass list">
            {top?.list.map((u: any, i: number) => (
              <div key={u.id} className={`top-row${u.id === p.user.id ? ' me' : ''}`}>
                <span className="place">{['🥇', '🥈', '🥉'][i] ?? i + 1}</span><Avatar u={u} size={30} />
                <span className="grow">{who(u)}{u.is_vip ? ' 👑' : ''}</span>
                <b>{topKind === 'wins' ? u.value : money(u.value)}</b>
              </div>
            )) ?? <div className="hint">Загрузка…</div>}
          </div>
        </>
      )}

      {tab === 'friends' && (
        <div className="glass">
          <p>За каждого друга — <b>{money(p.referral.inviter)}</b> тебе и <b>{money(p.referral.invited)}</b> другу. Первая покупка друга — ещё <b>{money(p.referral.first_purchase)}</b>. Каждые {p.referral.epic_every} друзей — 🟣 эпическая машина.</p>
          {friends && <button className="btn primary wide" onClick={() => share(friends.link, 'Залетай на аукцион машин!')}>📤 Пригласить друга</button>}
          <div className="list">
            {friends?.list.map((f: any) => <div key={f.id} className="top-row"><Avatar u={f} size={28} /><span className="grow">{who(f)}</span><span className="hint small">{ago(f.created_at)}</span></div>)}
            {friends && !friends.list.length && <div className="hint">Пока никого</div>}
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="glass list">
          {hist?.map((h, i) => (
            <div key={i} className="top-row">
              <span className="grow">{LEDGER[h.kind] ?? h.kind}<div className="hint small">{ago(h.created_at)}</div></span>
              <b className={h.delta > 0 ? 'up' : 'down'}>{h.delta > 0 ? '+' : ''}{money(h.delta)}</b>
            </div>
          )) ?? <div className="hint">Загрузка…</div>}
        </div>
      )}

      <Sheet open={send} onClose={() => setSend(false)} title="Перевод игроку">
        <input className="field" placeholder="@username или ID" value={to} onChange={(e) => setTo(e.target.value)} />
        <input className="field" inputMode="numeric" placeholder="Сумма" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} />
        <div className="hint small">Комиссия {p.fees.transfer / 100}% · получит {money(Math.floor((Number(amount) || 0) * (1 - p.fees.transfer / 10000)))}</div>
        <button className="btn primary wide" disabled={busy || !to || !amount} onClick={async () => { await run({ action: 'transfer', to, amount: Number(amount) }, (r) => `Переведено, получит ${money(r.net)}`); setSend(false); setAmount(''); }}>Перевести</button>
      </Sheet>
    </div>
  );
}
