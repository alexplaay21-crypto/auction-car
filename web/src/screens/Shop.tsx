import { useCallback, useEffect, useState } from 'react';
import { call, clientId, errorText, haptic, toast } from '../tg';
import { money, RARITY } from '../format';
import { CarCard, ContainerArt, Sheet } from '../components';
import { Chances } from './Auction';

export function Shop({ onBalance }: { onBalance: () => void }) {
  const [s, setS] = useState<any>(null);
  const [cat, setCat] = useState<any>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<any>(null);

  const load = useCallback(() => call('app_shop', { action: 'list' }).then(setS, (e) => toast(errorText(e))), []);
  useEffect(() => { load(); call('app_shop', { action: 'catalog' }).then(setCat, () => {}); }, [load]);

  const run = async (name: string, input: any, ok: string) => {
    if (busy) return;
    setBusy(true);
    try { await call(name, { clientId: clientId(), ...input }); haptic('success'); toast(ok); onBalance(); load(); }
    catch (e) { haptic('error'); toast(errorText(e)); }
    setBusy(false);
  };

  if (!s) return <div className="center hint">Загрузка…</div>;
  return (
    <div className="page">
      <div className="balance-line glass">Баланс <b>{money(s.balance)}</b></div>

      {!s.vip.owned && (
        <div className="glass vip-card">
          <div className="vip-crown">👑</div>
          <div className="grow">
            <b>VIP навсегда</b>
            <ul className="small">
              <li>+{s.vip.bonus_slots} мест в гараже</li>
              <li>Комиссии ниже: быстрая продажа 5%, перевод 0%</li>
              <li>Ежедневный бонус ×2</li>
            </ul>
          </div>
          <button className="btn primary" disabled={busy} onClick={() => run('app_me', { action: 'vip' }, 'VIP активирован!')}>{money(s.vip.price)}</button>
        </div>
      )}

      {s.tier && (
        <div className="glass row-card">
          <div className="big-emoji">🅿️</div>
          <div className="grow"><b>Расширить гараж до {s.tier.total} мест</b><div className="hint small">Места не исчезают</div></div>
          <button className="btn" disabled={busy} onClick={() => run('app_garage', { action: 'upgrade' }, 'Гараж расширен!')}>{money(s.tier.price)}</button>
        </div>
      )}

      {s.lots.length > 0 && (
        <div className="section">
          <h3>Предложения</h3>
          {s.lots.map((l: any) => (
            <div key={l.id} className="glass row-card">
              <div className="big-emoji">🎁</div>
              <div className="grow">
                <b>{l.title}</b>
                {l.description && <div className="hint small">{l.description}</div>}
                <div className="hint small">
                  {[l.money ? money(l.money) : null, l.container_qty ? `${l.container_emoji ?? '📦'} ${l.container_name} ×${l.container_qty}` : null,
                    l.car_name ? `${RARITY[l.car_rarity]?.icon} ${l.car_name}` : null, l.vip ? '👑 VIP' : null].filter(Boolean).join(' · ')}
                </div>
              </div>
              <button className="btn primary" disabled={busy || (l.per_user_limit && l.bought >= l.per_user_limit)} onClick={() => run('app_shop', { action: 'buy', id: l.id }, 'Куплено!')}>{money(l.price)}</button>
            </div>
          ))}
        </div>
      )}

      <div className="section">
        <h3>Промокод</h3>
        <div className="glass row-card">
          <input className="field grow" placeholder="Введи код" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <button className="btn primary" disabled={busy || code.length < 3} onClick={async () => { await run('app_me', { action: 'promo', code }, 'Промокод активирован!'); setCode(''); }}>OK</button>
        </div>
      </div>

      {cat && (
        <div className="section">
          <h3>Контейнеры и шансы</h3>
          {cat.containers.map((c: any) => (
            <button key={c.id} className="glass row-card btn-reset" onClick={() => setView(c)}>
              <ContainerArt c={c} size={44} />
              <div className="grow"><b>{c.name}</b><div className="hint small">старт {money(c.price)} · {cat.cars.filter((x: any) => x.container_id === c.id).length} машин</div><Chances ch={c.chances} /></div>
            </button>
          ))}
        </div>
      )}

      <Sheet open={!!view} onClose={() => setView(null)} title={view?.name}>
        {view && (
          <>
            <Chances ch={view.chances} />
            <div className="grid">
              {cat.cars.filter((x: any) => x.container_id === view.id).map((c: any) => <CarCard key={c.id} car={c} />)}
            </div>
          </>
        )}
      </Sheet>
    </div>
  );
}
