import { useCallback, useEffect, useState } from 'react';
import { Check, Lock } from 'lucide-react';
import { call, errorText, haptic, toast } from '../tg';
import { money } from '../format';
import { t } from '../i18n';
import { Avatar, Money, ProfileBg } from '../components';
import { AppBar, Seg } from '../ui';
import { useApp } from '../App';

// Оформление профиля: фоны карточки и рамки аватара. Нажатие — примерка, покупка — сразу надевает.
export function StylePage() {
  const { me, pop, reload } = useApp();
  const [d, setD] = useState<any>(null);
  const [kind, setKind] = useState<'bg' | 'frame'>('bg');
  const [pick, setPick] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => call('app_player', { action: 'cosmetics' }).then(setD, (e) => toast(errorText(e))), []);
  useEffect(() => { load(); }, [load]);

  const act = async (input: any, ok: string) => {
    if (busy) return;
    setBusy(true);
    try { setD(await call('app_player', input)); haptic('success'); toast(ok); reload(); } catch (e) { haptic('error'); toast(errorText(e)); }
    setBusy(false);
  };
  const bg = pick?.kind === 'bg' ? pick.id : d?.bg;
  const frame = pick?.kind === 'frame' ? pick.id : d?.frame;
  const items = (d?.items ?? []).filter((i: any) => i.kind === kind);

  return (
    <>
      <AppBar title={t('Оформление профиля')} back={pop} />
      <div className="page">
        <div className="card phead" style={{ minHeight: 120 }}>
          <ProfileBg id={bg} />
          <div className="row">
            <Avatar u={{ ...me.user, profile_frame: frame }} size={60} />
            <div className="grow col" style={{ gap: 2 }}>
              <div className="h3 ell">{me.user.first_name || me.user.username}</div>
              <div className="xs muted">{pick && !pick.owned ? t('Примерка — так увидят твой профиль') : t('Так твой профиль видят другие игроки')}</div>
            </div>
          </div>
          <Money value={me.balance} className="big-money" />
        </div>

        <Seg value={kind} onChange={(k) => { setKind(k); setPick(null); }} options={[['bg', t('Фоны')], ['frame', t('Рамки')]]} />

        <div className="style-grid">
          {items.map((c: any) => (
            <button key={c.id} className={`style-item press${pick?.id === c.id ? ' on' : ''}`} onClick={() => setPick(c)}>
              {c.equipped && <span className="eq rtag r-epic"><Check size={11} /> {t('надето')}</span>}
              <div className="sw">
                {c.kind === 'bg' ? <ProfileBg id={c.id} /> : <Avatar u={{ ...me.user, profile_frame: c.id }} size={50} />}
              </div>
              <div className="nm ell">{t(c.name)}</div>
              <div className="ft">
                {c.owned ? <span className="xs c-green b">{t('куплено')}</span> : <span className="sm b num">{money(c.price)}</span>}
                {!c.owned && me.balance < c.price && <Lock size={14} className="muted" />}
              </div>
            </button>
          ))}
        </div>

        {pick && (
          <div className="card" style={{ position: 'sticky', bottom: 86, zIndex: 5 }}>
            <div className="row between"><b>{t(pick.name)}</b>{!pick.owned && <span className="num b">{money(pick.price)}</span>}</div>
            {!pick.owned ? (
              <button className="btn go xl w" disabled={busy || me.balance < pick.price} onClick={() => act({ action: 'buy_cosmetic', id: pick.id }, t('Куплено и надето')).then(() => setPick(null))}>
                {me.balance < pick.price ? t('Не хватает {m}', { m: money(pick.price - me.balance) }) : t('Купить за {m}', { m: money(pick.price) })}
              </button>
            ) : pick.id === (pick.kind === 'bg' ? d?.bg : d?.frame) ? (
              <button className="btn ghost w" disabled={busy} onClick={() => act({ action: 'equip', id: null, kind: pick.kind }, t('Снято')).then(() => setPick(null))}>{t('Снять')}</button>
            ) : (
              <button className="btn go w" disabled={busy} onClick={() => act({ action: 'equip', id: pick.id }, t('Надето')).then(() => setPick(null))}>{t('Надеть')}</button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
