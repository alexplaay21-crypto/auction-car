import { useCallback, useEffect, useState } from 'react';
import { call, tg } from './tg';
import { Toasts, Money } from './components';
import { Auction } from './screens/Auction';
import { Garage } from './screens/Garage';
import { Shop } from './screens/Shop';
import { Profile } from './screens/Profile';
import { Admin } from './screens/Admin';

type Tab = 'auction' | 'garage' | 'shop' | 'profile' | 'admin';
const TABS: [Tab, string, string][] = [['auction', '🚢', 'Аукцион'], ['garage', '🚗', 'Гараж'], ['shop', '🛒', 'Магазин'], ['profile', '👤', 'Профиль']];

function startParams() {
  const sp = String(tg?.initDataUnsafe?.start_param ?? '');
  const hash = location.hash.replace(/^#/, '');
  return {
    scope: /^g\d+$/.test(sp) ? sp : null,
    tab: (['garage', 'shop', 'profile', 'top'].includes(hash) ? (hash === 'top' ? 'profile' : hash) : /^car-\d+$/.test(hash) ? 'garage' : 'auction') as Tab,
    car: /^car-(\d+)$/.exec(hash)?.[1] ? Number(/^car-(\d+)$/.exec(hash)![1]) : null,
  };
}

export function App() {
  const start = startParams();
  const [tab, setTab] = useState<Tab>(start.tab);
  const [me, setMe] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => call('app_me', {}).then(setMe, (e) => setErr(e?.code === 'NO_TELEGRAM' ? 'Открой игру внутри Telegram' : 'Не удалось загрузить игру')), []);
  useEffect(() => {
    tg?.ready?.(); tg?.expand?.();
    try { tg?.setHeaderColor?.('#0c0f17'); tg?.setBackgroundColor?.('#0c0f17'); } catch { /* старые клиенты */ }
    load();
  }, [load]);

  if (err) return <div className="center"><div className="glass hero"><div className="hero-ship">🚢</div><p>{err}</p></div></div>;
  if (!me) return <div className="center"><div className="loader">🚢</div></div>;

  return (
    <div className="app">
      <header className="top">
        <div className="logo">🚢 <b>Car Auction</b></div>
        <button className="balance-chip" onClick={() => setTab('profile')}>
          {me.user.is_vip ? '👑 ' : ''}<Money value={me.balance} />
        </button>
      </header>
      <main>
        {tab === 'auction' && <Auction me={me.user} scope={start.scope} balance={me.balance} onBalance={load} onOpenGarage={() => setTab('garage')} />}
        {tab === 'garage' && <Garage focus={start.car} onBalance={load} />}
        {tab === 'shop' && <Shop onBalance={load} />}
        {tab === 'profile' && <Profile p={me} reload={load} onAdmin={() => setTab('admin')} />}
        {tab === 'admin' && <Admin onBack={() => setTab('profile')} />}
      </main>
      <nav className="tabs">
        {TABS.map(([k, icon, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => { setTab(k); tg?.HapticFeedback?.selectionChanged?.(); if (k !== 'auction') load(); }}>
            <span className="ti">{icon}</span><span className="tl">{label}</span>
          </button>
        ))}
      </nav>
      <Toasts />
    </div>
  );
}
