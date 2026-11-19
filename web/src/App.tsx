import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Home as HomeIcon, Gavel, CarFront, Store, UserRound, Loader2 } from 'lucide-react';
import { call, tg } from './tg';
import { Toasts } from './components';
import { FloatingNav } from './ui';
import { Home } from './screens/Home';
import { Auction } from './screens/Auction';
import { Garage, CarPage } from './screens/Garage';
import { Shop, CatalogPage } from './screens/Shop';
import { Profile, LeadersPage, HistoryPage, FriendsPage, TransferPage, PromoPage } from './screens/Profile';
import { Admin } from './screens/Admin';

export type Tab = 'home' | 'auction' | 'garage' | 'shop' | 'profile';
export type Route = { name: 'car'; id: number } | { name: 'catalog'; id: number } | { name: 'leaders' | 'history' | 'friends' | 'transfer' | 'promo' | 'admin' };

type Ctx = { me: any; reload: () => Promise<void>; tab: Tab; setTab: (t: Tab) => void; push: (r: Route) => void; pop: () => void; scope: string | null };
const AppCtx = createContext<Ctx>(null as any);
export const useApp = () => useContext(AppCtx);

const TABS: [Tab, any, string][] = [
  ['home', HomeIcon, 'Главная'], ['auction', Gavel, 'Аукцион'], ['garage', CarFront, 'Гараж'], ['shop', Store, 'Магазин'], ['profile', UserRound, 'Профиль'],
];

function start() {
  const sp = String(tg?.initDataUnsafe?.start_param ?? '');
  const hash = location.hash.replace(/^#/, '');
  const car = /^car-(\d+)$/.exec(hash);
  const tab: Tab = /^g\d+$/.test(sp) || sp === 'play' ? 'auction'
    : (['garage', 'shop', 'profile', 'auction'] as string[]).includes(hash) ? hash as Tab : car ? 'garage' : hash === 'top' ? 'profile' : 'home';
  const routes: Route[] = car ? [{ name: 'car', id: Number(car[1]) }] : hash === 'top' ? [{ name: 'leaders' }] : [];
  return { scope: /^g\d+$/.test(sp) ? sp : null, tab, routes };
}

export function App() {
  const s0 = useState(start)[0];
  const [tab, setTabState] = useState<Tab>(s0.tab);
  const [stack, setStack] = useState<Route[]>(s0.routes);
  const [me, setMe] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(() => call('app_me', {}).then(setMe, (e) => { if (!me) setErr(e?.code === 'NO_TELEGRAM' ? 'Открой игру внутри Telegram' : 'Не удалось загрузить игру'); }), [me]);
  useEffect(() => {
    tg?.ready?.(); tg?.expand?.();
    try { tg?.setHeaderColor?.('#0b0d24'); tg?.setBackgroundColor?.('#0b0d24'); tg?.setBottomBarColor?.('#0b0d24'); } catch { /* старый клиент */ }
    reload();
  }, []); // eslint-disable-line

  const setTab = (t: Tab) => { setStack([]); setTabState(t); window.scrollTo({ top: 0 }); if (t !== 'auction') reload(); };
  const push = (r: Route) => { setStack((s) => [...s, r]); window.scrollTo({ top: 0 }); };
  const pop = useCallback(() => setStack((s) => s.slice(0, -1)), []);

  if (err) return <div className="loader"><div className="card center-text" style={{ margin: 16 }}>{err}</div></div>;
  if (!me) return <div className="loader"><Loader2 size={34} className="spin" /></div>;

  const top = stack[stack.length - 1];
  const ctx: Ctx = { me, reload, tab, setTab, push, pop, scope: s0.scope };
  return (
    <AppCtx.Provider value={ctx}>
      <div className="app">
        {top ? (
          <Page route={top} />
        ) : (
          <>
            {tab === 'home' && <Home />}
            {tab === 'auction' && <Auction />}
            {tab === 'garage' && <Garage />}
            {tab === 'shop' && <Shop />}
            {tab === 'profile' && <Profile />}
          </>
        )}
        {!top && <FloatingNav items={TABS} value={tab} onChange={setTab} />}
        <Toasts />
      </div>
    </AppCtx.Provider>
  );
}

function Page({ route }: { route: Route }) {
  switch (route.name) {
    case 'car': return <CarPage id={route.id} />;
    case 'catalog': return <CatalogPage id={route.id} />;
    case 'leaders': return <LeadersPage />;
    case 'history': return <HistoryPage />;
    case 'friends': return <FriendsPage />;
    case 'transfer': return <TransferPage />;
    case 'promo': return <PromoPage />;
    case 'admin': return <Admin />;
  }
}
