import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Home as HomeIcon, Flag, Gavel, Store, UserRound, Loader2 } from 'lucide-react';
import { call, tg } from './tg';
import { Toasts } from './components';
import { Home } from './screens/Home';
import { Auction } from './screens/Auction';
import { Race } from './screens/Race';
import { Market } from './screens/Market';
import { Garage, CarPage } from './screens/Garage';
import { ShopPage, CatalogPage } from './screens/Shop';
import { StylePage } from './screens/Style';
import { Player, LeadersPage, HistoryPage, FriendsPage, TransferPage, PromoPage, SkillPage, FeedbackPage } from './screens/Profile';
import { BattlePass } from './screens/BattlePass';
import { Admin } from './screens/Admin';
import { SettingsPage } from './screens/Settings';
import { t, setLang, getLang } from './i18n';
import { setFx, select } from './sound';

export type Tab = 'home' | 'race' | 'auction' | 'market' | 'profile';
export type Route =
  | { name: 'player'; id: number } | { name: 'car'; id: number } | { name: 'catalog'; id: number } | { name: 'transfer'; to?: string }
  | { name: 'garage' | 'skill' | 'bp' | 'shop' | 'friends' | 'promo' | 'leaders' | 'history' | 'admin' | 'settings' | 'feedback' | 'style' };

type Ctx = {
  me: any; reload: () => Promise<void>; tab: Tab; setTab: (t: Tab) => void;
  push: (r: Route) => void; pop: () => void; open: (userId: number) => void; scope: string | null;
};
const AppCtx = createContext<Ctx>(null as any);
export const useApp = () => useContext(AppCtx);

const TABS: [Tab, any, string][] = [['home', HomeIcon, 'Главная'], ['race', Flag, 'Гонки'], ['auction', Gavel, 'Аукцион'], ['market', Store, 'Рынок'], ['profile', UserRound, 'Профиль']];
void select;

function start() {
  const sp = String(tg?.initDataUnsafe?.start_param ?? '');
  const hash = location.hash.replace(/^#/, '');
  const car = /^car-(\d+)$/.exec(hash);
  const tab: Tab = /^g\d+$/.test(sp) || sp === 'play' ? 'auction'
    : (['race', 'market', 'profile', 'auction'] as string[]).includes(hash) ? hash as Tab : hash === 'top' || hash === 'garage' || hash === 'admin' || hash === 'feedback' || car ? 'profile' : 'home';
  const routes: Route[] = car ? [{ name: 'garage' }, { name: 'car', id: Number(car[1]) }] : hash === 'garage' ? [{ name: 'garage' }] : hash === 'top' ? [{ name: 'leaders' }] : hash === 'shop' ? [{ name: 'shop' }] : hash === 'admin' ? [{ name: 'admin' }] : hash === 'feedback' ? [{ name: 'feedback' }] : [];
  return { scope: /^g\d+$/.test(sp) ? sp : null, tab, routes };
}

export function App() {
  const s0 = useState(start)[0];
  const [tab, setTabState] = useState<Tab>(s0.tab);
  const [stack, setStack] = useState<Route[]>(s0.routes);
  const [me, setMe] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const r = await call('app_me', {});
      if (r.settings) { if (r.settings.lang !== getLang()) setLang(r.settings.lang); setFx(r.settings); }
      setMe({ ...r, _loaded: Date.now() / 1000 });
    } catch (e: any) { setErr(e?.code === 'NO_TELEGRAM' ? t('Открой игру внутри Telegram') : t('Не удалось загрузить игру')); }
  }, []);
  useEffect(() => {
    tg?.ready?.(); tg?.expand?.();
    try { tg?.setHeaderColor?.('#07080d'); tg?.setBackgroundColor?.('#07080d'); tg?.setBottomBarColor?.('#07080d'); } catch { /* старый клиент */ }
    reload();
  }, [reload]);

  const setTab = useCallback((x: Tab) => { setStack([]); setTabState(x); window.scrollTo({ top: 0 }); select(); }, []);
  const push = useCallback((r: Route) => { setStack((s) => [...s, r]); window.scrollTo({ top: 0 }); }, []);
  const pop = useCallback(() => setStack((s) => s.slice(0, -1)), []);
  const open = useCallback((id: number) => push({ name: 'player', id }), [push]);

  if (err && !me) return <div className="loader"><div className="card center" style={{ margin: 16 }}>{err}</div></div>;
  if (!me) return <div className="loader"><Loader2 size={36} className="spin" /></div>;

  const top = stack[stack.length - 1];
  return (
    <AppCtx.Provider value={{ me, reload, tab, setTab, push, pop, open, scope: s0.scope }}>
      <div className="lg-bg" aria-hidden><i /><i /><i /></div>
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
        <TabBar tab={tab} top={!!top} setTab={setTab} bonus={!!me.bonus.available} />
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
    case 'settings': return <SettingsPage />;
    case 'feedback': return <FeedbackPage />;
    case 'style': return <StylePage />;
  }
}

// Нижнее меню-островок: нажатие или проведение пальцем — подсветка едет за пальцем,
// при отпускании открывается раздел под ним.
function TabBar({ tab, top, setTab, bonus }: { tab: Tab; top: boolean; setTab: (t: Tab) => void; bonus: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const st = useRef<{ x0: number; moved: boolean; last: number } | null>(null);
  const suppress = useRef(false);
  const [pos, setPos] = useState<number | null>(null);
  const cur = TABS.findIndex(([k]) => k === tab);
  const at = (x: number) => {
    const r = ref.current!.getBoundingClientRect();
    const w = (r.width - 12) / TABS.length;
    return Math.max(0, Math.min(TABS.length - 1, (x - r.left - 6) / w - 0.5));
  };
  const down = (e: React.PointerEvent) => { st.current = { x0: e.clientX, moved: false, last: Math.round(at(e.clientX)) }; };
  const move = (e: React.PointerEvent) => {
    const s = st.current;
    if (!s) return;
    if (!s.moved && Math.abs(e.clientX - s.x0) < 8) return;
    if (!s.moved) { s.moved = true; ref.current?.setPointerCapture?.(e.pointerId); }
    const p = at(e.clientX);
    setPos(p);
    const i = Math.round(p);
    if (i !== s.last) { s.last = i; select(); }
  };
  const up = () => {
    const s = st.current;
    st.current = null;
    if (s?.moved) {
      suppress.current = true; setTimeout(() => { suppress.current = false; }, 50);
      const i = s.last;
      setPos(null);
      if (TABS[i][0] !== tab || top) setTab(TABS[i][0]);
    }
  };
  const shown = pos ?? cur;
  const hide = pos == null && (top || tab === 'auction');
  return (
    <nav className="tabbar">
      <div ref={ref} className={`in${pos != null ? ' dragging' : ''}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <span className="tab-pill" style={{ ['--i' as any]: shown, opacity: hide ? 0 : 1 }} />
        {TABS.map(([k, I, label], i) => {
          const on = pos != null ? Math.round(pos) === i : !top && tab === k;
          return (
            <button key={k} className={`${k === 'auction' ? 'mid ' : ''}${on ? 'on' : ''}`} onClick={() => { if (!suppress.current) setTab(k); }}>
              {k === 'auction' ? <span className="fab"><I size={26} strokeWidth={2.4} /></span> : <I size={22} strokeWidth={2.2} />}
              <span>{t(label)}</span>
              {k === 'home' && bonus && <span className="badge-dot" />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
