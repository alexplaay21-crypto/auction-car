import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Home as HomeIcon, Flag, Gavel, Store, UserRound, Loader2 } from 'lucide-react';
import { call, tg } from './tg';
import { Toasts } from './components';
import { Home } from './screens/Home';
import { Auction } from './screens/Auction';
import { Race } from './screens/Race';
import { Market } from './screens/Market';
import { Garage, CarPage } from './screens/Garage';
import { ShopPage, CatalogPage } from './screens/Shop';
import { Player, LeadersPage, HistoryPage, FriendsPage, TransferPage, PromoPage, SkillPage } from './screens/Profile';
import { BattlePass } from './screens/BattlePass';
import { Admin } from './screens/Admin';

export type Tab = 'home' | 'race' | 'auction' | 'market' | 'profile';
export type Route =
  | { name: 'player'; id: number } | { name: 'car'; id: number } | { name: 'catalog'; id: number } | { name: 'transfer'; to?: string }
  | { name: 'garage' | 'skill' | 'bp' | 'shop' | 'friends' | 'promo' | 'leaders' | 'history' | 'admin' };

type Ctx = {
  me: any; reload: () => Promise<void>; tab: Tab; setTab: (t: Tab) => void;
  push: (r: Route) => void; pop: () => void; open: (userId: number) => void; scope: string | null;
};
const AppCtx = createContext<Ctx>(null as any);
export const useApp = () => useContext(AppCtx);

const TABS: [Tab, any, string][] = [['home', HomeIcon, 'Главная'], ['race', Flag, 'Гонки'], ['auction', Gavel, 'Аукцион'], ['market', Store, 'Рынок'], ['profile', UserRound, 'Профиль']];

function start() {
  const sp = String(tg?.initDataUnsafe?.start_param ?? '');
  const hash = location.hash.replace(/^#/, '');
  const car = /^car-(\d+)$/.exec(hash);
  const tab: Tab = /^g\d+$/.test(sp) || sp === 'play' ? 'auction'
    : (['race', 'market', 'profile', 'auction'] as string[]).includes(hash) ? hash as Tab : hash === 'top' || hash === 'garage' || car ? 'profile' : 'home';
  const routes: Route[] = car ? [{ name: 'garage' }, { name: 'car', id: Number(car[1]) }] : hash === 'garage' ? [{ name: 'garage' }] : hash === 'top' ? [{ name: 'leaders' }] : hash === 'shop' ? [{ name: 'shop' }] : [];
  return { scope: /^g\d+$/.test(sp) ? sp : null, tab, routes };
}

export function App() {
  const s0 = useState(start)[0];
  const [tab, setTabState] = useState<Tab>(s0.tab);
  const [stack, setStack] = useState<Route[]>(s0.routes);
  const [me, setMe] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try { setMe(await call('app_me', {})); } catch (e: any) { setErr(e?.code === 'NO_TELEGRAM' ? 'Открой игру внутри Telegram' : 'Не удалось загрузить игру'); }
  }, []);
  useEffect(() => {
    tg?.ready?.(); tg?.expand?.();
    try { tg?.setHeaderColor?.('#0d0f14'); tg?.setBackgroundColor?.('#0d0f14'); tg?.setBottomBarColor?.('#11141b'); } catch { /* старый клиент */ }
    reload();
  }, [reload]);

  const setTab = useCallback((t: Tab) => { setStack([]); setTabState(t); window.scrollTo({ top: 0 }); tg?.HapticFeedback?.selectionChanged?.(); }, []);
  const push = useCallback((r: Route) => { setStack((s) => [...s, r]); window.scrollTo({ top: 0 }); }, []);
  const pop = useCallback(() => setStack((s) => s.slice(0, -1)), []);
  const open = useCallback((id: number) => push({ name: 'player', id }), [push]);

  if (err && !me) return <div className="loader"><div className="card center" style={{ margin: 16 }}>{err}</div></div>;
  if (!me) return <div className="loader"><Loader2 size={36} className="spin" /></div>;

  const top = stack[stack.length - 1];
  return (
    <AppCtx.Provider value={{ me, reload, tab, setTab, push, pop, open, scope: s0.scope }}>
      <div className="app">
        {top ? <Page r={top} /> : (
          <>
            {tab === 'home' && <Home />}
            {tab === 'race' && <Race />}
            {tab === 'auction' && <Auction />}
            {tab === 'market' && <Market />}
            {tab === 'profile' && <Player id={me.user.id} root />}
          </>
        )}
        <nav className="tabbar">
          <div className="in">
            {TABS.map(([k, I, label]) => (
              <button key={k} className={`${k === 'auction' ? 'mid ' : ''}${!top && tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
                {k === 'auction' ? <span className="fab"><I size={26} strokeWidth={2.4} /></span> : <I size={22} strokeWidth={2.2} />}
                <span>{label}</span>
                {k === 'home' && me.bonus.available && <span className="badge-dot" />}
              </button>
            ))}
          </div>
        </nav>
        <Toasts />
      </div>
    </AppCtx.Provider>
  );
}

function Page({ r }: { r: Route }) {
  switch (r.name) {
    case 'player': return <Player id={r.id} />;
    case 'car': return <CarPage id={r.id} />;
    case 'catalog': return <CatalogPage id={r.id} />;
    case 'transfer': return <TransferPage to={r.to} />;
    case 'garage': return <Garage />;
    case 'skill': return <SkillPage />;
    case 'bp': return <BattlePass />;
    case 'shop': return <ShopPage />;
    case 'friends': return <FriendsPage />;
    case 'promo': return <PromoPage />;
    case 'leaders': return <LeadersPage />;
    case 'history': return <HistoryPage />;
    case 'admin': return <Admin />;
  }
}
