import { useEffect, useState } from 'react';
import { Gift, Send, Ticket, Users, Gavel, Crown, Trophy, CarFront, Timer } from 'lucide-react';
import { call, clientId, errorText, haptic, toast } from '../tg';
import { money, who } from '../format';
import { Avatar, CarCard, ContainerArt, Money } from '../components';
import { Card, Badge, SectionTitle, ListRow, StatusLine, ScreenHead } from '../ui';
import { useApp } from '../App';

function greeting() {
  const h = new Date().getHours();
  return h >= 5 && h < 12 ? 'Доброе утро' : h < 18 && h >= 12 ? 'Добрый день' : h >= 18 && h < 23 ? 'Добрый вечер' : 'Доброй ночи';
}

export function Home() {
  const { me, reload, setTab, push } = useApp();
  const [room, setRoom] = useState<any>(undefined);
  const [cars, setCars] = useState<any[] | null>(null);
  const [top, setTop] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    call('app_room', { action: 'state' }).then((r) => setRoom(r.room), () => setRoom(null));
    call('app_garage', { action: 'list' }).then((g) => setCars(g.cars.slice(0, 8)), () => setCars([]));
    call('app_shop', { action: 'top', kind: 'balance' }).then((t) => setTop(t.list.slice(0, 3)), () => setTop([]));
  }, []);

  const bonus = async () => {
    if (busy || !me.bonus.available) return;
    setBusy(true);
    try { const r = await call('app_me', { action: 'bonus', clientId: clientId() }); haptic('success'); toast(`Бонус +${money(r.result.amount)}`); await reload(); }
    catch (e) { haptic('error'); toast(errorText(e)); }
    setBusy(false);
  };

  const name = me.user.first_name || me.user.username;
  const a = room?.auction;
  return (
    <div className="screen">
      <ScreenHead brand="Car Auction" title={name ? `${greeting()}, ${String(name).split(' ')[0]}` : greeting()}
        trailing={<button className="avatar-btn" onClick={() => setTab('profile')}><Avatar u={me.user} size={42} /></button>} />

      <Card>
        <div className="row">
          <div className="grow">
            <div className="t-small muted">Баланс</div>
            <Money value={me.balance} className="balance" />
          </div>
          {me.user.is_vip ? <span className="vip-pill"><Crown size={12} /> VIP</span> : <Badge icon={CarFront} />}
        </div>
        <div className="divider" />
        <StatusLine label="Гараж" value={`${me.garage.owned} из ${me.garage.capacity}`} color={me.garage.owned >= me.garage.capacity * 0.8 ? 'var(--warning)' : 'var(--success)'} />
        <StatusLine label="Стоимость машин" value={money(me.garage.value)} color="var(--accent)" />
        <StatusLine label="Место в рейтинге" value={`#${me.place}`} color="var(--rose)" />
      </Card>

      <div className="tiles">
        <button className={`tile tap${me.bonus.available ? ' hot' : ''}`} onClick={bonus}><Badge icon={Gift} tone={me.bonus.available ? '' : 'teal'} size={38} /><span className="t-label">{me.bonus.available ? 'Бонус' : 'Завтра'}</span></button>
        <button className="tile tap" onClick={() => push({ name: 'transfer' })}><Badge icon={Send} tone="teal" size={38} /><span className="t-label">Перевод</span></button>
        <button className="tile tap" onClick={() => push({ name: 'promo' })}><Badge icon={Ticket} tone="rose" size={38} /><span className="t-label">Промокод</span></button>
        <button className="tile tap" onClick={() => push({ name: 'friends' })}><Badge icon={Users} tone="gold" size={38} /><span className="t-label">Друзья</span></button>
      </div>

      <SectionTitle>Аукцион сейчас</SectionTitle>
      <Card onClick={() => setTab('auction')}>
        <div className="row">
          {a ? <ContainerArt c={a.container} size={46} /> : <Badge icon={Gavel} />}
          <div className="grow">
            <div className="t-title">{a ? (a.status === 'active' ? a.container.name : 'Пауза между контейнерами') : 'Войди в комнату'}</div>
            <div className="t-small muted">
              {room === undefined ? 'Загрузка…'
                : a?.status === 'active' ? `Ставка ${money(a.current)} · ${room.count} игроков`
                : room ? `Комната №${room.number} · ${room.count} игроков` : 'До 30 игроков, таймер 30 секунд после каждой ставки'}
            </div>
          </div>
          <span className="btn primary s"><Timer size={14} /> Играть</span>
        </div>
      </Card>

      <SectionTitle action={cars?.length ? 'Гараж' : undefined} onAction={() => setTab('garage')}>Лучшие машины</SectionTitle>
      {cars && cars.length ? (
        <div className="hscroll">
          {cars.map((c) => <div key={c.user_car_id} className="mini-car"><CarCard car={c} onClick={() => push({ name: 'car', id: c.user_car_id })} /></div>)}
        </div>
      ) : (
        <Card><ListRow icon={CarFront} title="Гараж пока пуст" subtitle="Выиграй первый контейнер на аукционе" onClick={() => setTab('auction')} /></Card>
      )}

      <SectionTitle action="Все" onAction={() => push({ name: 'leaders' })}>Лидеры</SectionTitle>
      <Card className="tight">
        {top?.map((u, i) => (
          <ListRow key={u.id} leading={<Avatar u={u} size={38} />} title={`${['🥇', '🥈', '🥉'][i]} ${who(u)}`} subtitle={u.is_vip ? 'VIP' : undefined}
            trailing={<b className="num">{money(u.value)}</b>} onClick={() => push({ name: 'leaders' })} chevron={false} />
        )) ?? <ListRow icon={Trophy} title="Загрузка…" />}
      </Card>
    </div>
  );
}
