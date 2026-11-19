import { useEffect, useState } from 'react';
import { Trophy, History, Users, Send, Ticket, Shield, Crown, Package, Gavel, Repeat, TrendingUp, TrendingDown, Share2, CarFront } from 'lucide-react';
import { call, clientId, errorText, haptic, share, toast } from '../tg';
import { money, who, ago, LEDGER, RARITY } from '../format';
import { Avatar, Money } from '../components';
import { Card, SectionTitle, ListRow, StatusLine, ScreenHead, TopBar, Segmented, Empty, Badge } from '../ui';
import { useApp } from '../App';

export function Profile() {
  const { me: p, push } = useApp();
  const s = p.stats;
  return (
    <div className="screen">
      <ScreenHead brand="Профиль" title={who(p.user)} />
      <Card>
        <div className="row">
          <Avatar u={p.user} size={58} />
          <div className="grow">
            <div className="t-small muted">Баланс</div>
            <Money value={p.balance} className="balance" />
          </div>
          {p.user.is_vip ? <span className="vip-pill"><Crown size={12} /> VIP</span> : null}
        </div>
        <div className="divider" />
        <StatusLine label="Место в рейтинге" value={`#${p.place}`} color="var(--rose)" />
        <StatusLine label="Гараж" value={`${p.garage.owned} из ${p.garage.capacity} · ${money(p.garage.value)}`} color="var(--success)" />
        {p.best && <StatusLine label="Лучшая машина" value={p.best.name} color={`var(--${p.best.rarity})`} />}
      </Card>

      <SectionTitle>Статистика</SectionTitle>
      <div className="grid">
        {[
          [Package, 'Контейнеров', s.containers_opened, ''], [Gavel, 'Побед', s.wins, 'rose'],
          [Repeat, 'Ставок', s.bids_made, 'teal'], [CarFront, 'Машин получено', s.cars_obtained, 'gold'],
          [TrendingUp, 'Заработано', money(s.earned_total), 'green'], [TrendingDown, 'Потрачено', money(s.spent_total), 'rose'],
        ].map(([Icon, l, v, tone]: any) => (
          <Card key={l}>
            <Badge icon={Icon} tone={tone} size={34} />
            <div><div className="t-title num">{v}</div><div className="t-small muted">{l}</div></div>
          </Card>
        ))}
      </div>

      <SectionTitle>Игра</SectionTitle>
      <Card className="tight">
        <ListRow icon={Trophy} tone="gold" title="Лидеры" subtitle="Самые богатые, дорогие гаражи и победы" onClick={() => push({ name: 'leaders' })} />
        <ListRow icon={Users} tone="teal" title="Друзья" subtitle={`Приглашено: ${s.referrals}`} onClick={() => push({ name: 'friends' })} />
        <ListRow icon={Send} title="Перевести деньги" subtitle={`Комиссия ${p.fees.transfer / 100}%`} onClick={() => push({ name: 'transfer' })} />
        <ListRow icon={Ticket} tone="rose" title="Промокод" onClick={() => push({ name: 'promo' })} />
        <ListRow icon={History} title="История операций" onClick={() => push({ name: 'history' })} />
      </Card>

      {p.user.is_admin ? (
        <Card className="tight"><ListRow icon={Shield} tone="rose" title="Админ-панель" subtitle="Каталог, игроки, настройки" onClick={() => push({ name: 'admin' })} /></Card>
      ) : null}
      <div className="t-small faint center-text">Комиссии: быстрая продажа {p.fees.quick / 100}% · государству {p.fees.state / 100}% · игроку {p.fees.player / 100}%</div>
    </div>
  );
}

export function LeadersPage() {
  const { me, pop } = useApp();
  const [kind, setKind] = useState<'balance' | 'garage' | 'wins'>('balance');
  const [list, setList] = useState<any[] | null>(null);
  useEffect(() => { setList(null); call('app_shop', { action: 'top', kind }).then((r) => setList(r.list), () => setList([])); }, [kind]);
  return (
    <div className="screen">
      <TopBar title="Лидеры" onBack={pop} />
      <Segmented value={kind} onChange={setKind} options={[['balance', 'Баланс'], ['garage', 'Гараж'], ['wins', 'Победы']]} />
      <Card className="tight">
        {list?.map((u, i) => (
          <ListRow key={u.id} leading={<div className="row gap-8"><b className="num" style={{ width: 22, textAlign: 'center' }}>{['🥇', '🥈', '🥉'][i] ?? i + 1}</b><Avatar u={u} size={36} /></div>}
            title={<span className={u.id === me.user.id ? 'accent' : ''}>{who(u)}{u.is_vip ? ' 👑' : ''}</span>}
            trailing={<b className="num">{kind === 'wins' ? u.value : money(u.value)}</b>} />
        )) ?? <ListRow icon={Trophy} title="Загрузка…" />}
      </Card>
    </div>
  );
}

export function HistoryPage() {
  const { pop } = useApp();
  const [items, setItems] = useState<any[] | null>(null);
  useEffect(() => { call('app_me', { action: 'history' }).then((r) => setItems(r.items), () => setItems([])); }, []);
  return (
    <div className="screen">
      <TopBar title="История операций" onBack={pop} />
      {items && !items.length ? <Empty icon={History} title="Операций пока нет" /> : (
        <Card className="tight">
          {items?.map((h, i) => (
            <ListRow key={i} icon={h.delta > 0 ? TrendingUp : TrendingDown} tone={h.delta > 0 ? 'green' : 'rose'} title={LEDGER[h.kind] ?? h.kind}
              subtitle={`${ago(h.created_at)} · баланс ${money(h.balance_after)}`}
              trailing={<b className={`num ${h.delta > 0 ? 'success' : 'danger'}`}>{h.delta > 0 ? '+' : ''}{money(h.delta)}</b>} />
          )) ?? <ListRow icon={History} title="Загрузка…" />}
        </Card>
      )}
    </div>
  );
}

export function FriendsPage() {
  const { me: p, pop } = useApp();
  const [f, setF] = useState<any>(null);
  useEffect(() => { call('app_me', { action: 'referrals' }).then(setF, () => {}); }, []);
  return (
    <div className="screen">
      <TopBar title="Друзья" onBack={pop} />
      <Card>
        <div className="row"><div className="grow t-title-l">Приглашай друзей</div><Badge icon={Users} tone="teal" /></div>
        <StatusLine label="Тебе за друга" value={money(p.referral.inviter)} color="var(--success)" />
        <StatusLine label="Другу за регистрацию" value={money(p.referral.invited)} color="var(--accent)" />
        <StatusLine label="За первую покупку друга" value={money(p.referral.first_purchase)} color="var(--rose)" />
        <StatusLine label={`Каждые ${p.referral.epic_every} друзей`} value={RARITY.epic.name + ' машина'} color="var(--epic)" />
        <button className="btn primary l block" disabled={!f} onClick={() => f && share(f.link, 'Залетай на аукцион машин!')}><Share2 size={18} /> Пригласить</button>
      </Card>
      <SectionTitle>Приглашены · {f?.list.length ?? 0}</SectionTitle>
      {f && !f.list.length ? <Empty icon={Users} title="Пока никого" text="Отправь ссылку другу — бонус придёт, как только он запустит бота." /> : (
        <Card className="tight">{f?.list.map((x: any) => <ListRow key={x.id} leading={<Avatar u={x} size={36} />} title={who(x)} subtitle={ago(x.created_at)} />)}</Card>
      )}
    </div>
  );
}

export function TransferPage() {
  const { me: p, pop, reload } = useApp();
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const net = Math.floor((Number(amount) || 0) * (1 - p.fees.transfer / 10000));
  return (
    <div className="screen">
      <TopBar title="Перевод" onBack={pop} />
      <Card>
        <input className="field" placeholder="@username или ID игрока" value={to} onChange={(e) => setTo(e.target.value)} />
        <input className="field big" inputMode="numeric" placeholder="$0" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} />
        <StatusLine label="Комиссия" value={`${p.fees.transfer / 100}%`} />
        <StatusLine label="Получит" value={money(net)} color="var(--success)" />
        <StatusLine label="Твой баланс" value={money(p.balance)} color="var(--muted)" />
        <button className="btn primary l block" disabled={busy || !to || !amount} onClick={async () => {
          setBusy(true);
          try { const r = await call('app_me', { action: 'transfer', to, amount: Number(amount), clientId: clientId() }); haptic('success'); toast(`Переведено, получит ${money(r.result.net)}`); await reload(); pop(); }
          catch (e) { haptic('error'); toast(errorText(e)); }
          setBusy(false);
        }}>Перевести</button>
      </Card>
    </div>
  );
}

export function PromoPage() {
  const { pop, reload } = useApp();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="screen">
      <TopBar title="Промокод" onBack={pop} />
      <Card>
        <div className="row"><div className="grow t-title">Введи код</div><Badge icon={Ticket} tone="rose" /></div>
        <input className="field big" placeholder="КОД" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ''))} />
        <button className="btn primary l block" disabled={busy || code.length < 3} onClick={async () => {
          setBusy(true);
          try { await call('app_me', { action: 'promo', code, clientId: clientId() }); haptic('success'); toast('Промокод активирован'); await reload(); pop(); }
          catch (e) { haptic('error'); toast(errorText(e)); }
          setBusy(false);
        }}>Активировать</button>
      </Card>
    </div>
  );
}
