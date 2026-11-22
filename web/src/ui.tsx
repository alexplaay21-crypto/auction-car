// ui.tsx — компоненты интерфейса Car Auction: шапка, нижняя панель, карточки, строки,
// кликабельные ники, выбор друзей и машин, мини-график цены.
import { useEffect, useState, type ReactNode } from 'react';
import { ChevronRight, ArrowLeft, Plus, type LucideIcon } from 'lucide-react';
import { call, tg } from './tg';
import { money, who } from './format';
import { Avatar, CarArt, Money } from './components';
import { useApp } from './App';
import { t } from './i18n';

export function Sect({ children, action, onAction }: { children: ReactNode; action?: string; onAction?: () => void }) {
  return <div className="sect"><span className="t">{children}</span>{action && onAction && <button className="a" onClick={onAction}>{action}</button>}</div>;
}

export function Ic({ icon: I, tone = '', size = 40 }: { icon: LucideIcon; tone?: string; size?: number }) {
  return <span className={`ic ${tone}`} style={{ width: size, height: size }}><I size={Math.round(size * 0.5)} strokeWidth={2.3} /></span>;
}

export function Li({ icon, tone, lead, title, sub, right, onClick, chev = !!onClick }:
  { icon?: LucideIcon; tone?: string; lead?: ReactNode; title: ReactNode; sub?: ReactNode; right?: ReactNode; onClick?: () => void; chev?: boolean }) {
  const body = (
    <>
      {lead ?? (icon ? <Ic icon={icon} tone={tone} size={38} /> : null)}
      <div className="grow col" style={{ gap: 2 }}>
        <div className="sb ell">{title}</div>
        {sub != null && <div className="sm muted">{sub}</div>}
      </div>
      {right}
      {chev && <ChevronRight size={18} className="chev" />}
    </>
  );
  return onClick ? <button className="li press" onClick={onClick}>{body}</button> : <div className="li">{body}</div>;
}

export function Kv({ k, v, c }: { k: ReactNode; v: ReactNode; c?: string }) {
  return <div className="kv"><span>{k}</span><b style={c ? { color: c } : undefined}>{v}</b></div>;
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  const i = Math.max(0, options.findIndex(([k]) => k === value));
  return (
    <div className="seg" style={{ ['--n' as any]: options.length, ['--i' as any]: i }}>
      <span className="seg-thumb" />
      {options.map(([k, l]) => <button key={k} className={value === k ? 'on' : ''} onClick={() => { onChange(k); tg?.HapticFeedback?.selectionChanged?.(); }}>{l}</button>)}
    </div>
  );
}

export function Empty({ icon: I, title, text, action, onAction }: { icon: LucideIcon; title: string; text?: string; action?: string; onAction?: () => void }) {
  return (
    <div className="card"><div className="empty">
      <Ic icon={I} size={52} /><div className="h3">{title}</div>
      {text && <div className="sm muted">{text}</div>}
      {action && onAction && <button className="btn go" onClick={onAction}>{action}</button>}
    </div></div>
  );
}

// Шапка: на главных экранах — аватар и баланс, на вложенных — «назад» и заголовок.
export function AppBar({ title, back }: { title?: ReactNode; back?: () => void }) {
  const { me, open, push } = useApp();
  useEffect(() => {
    const b = tg?.BackButton;
    if (!b || !back) return;
    b.show(); b.onClick(back);
    return () => { b.offClick(back); b.hide(); };
  }, [back]);
  return (
    <div className="appbar">
      {back ? <button className="back" onClick={back} aria-label={t('Назад')}><ArrowLeft size={20} /></button>
        : <button onClick={() => open(me.user.id)} aria-label={t('Профиль')}><Avatar u={me.user} size={34} /></button>}
      <div className="title ell">{title}</div>
      <button className="money-pill" onClick={() => push({ name: 'shop' })}>
        <Money value={me.balance} /><span className="plus"><Plus size={16} strokeWidth={3} /></span>
      </button>
    </div>
  );
}

// Кликабельный ник — открывает профиль игрока.
export function Nick({ u, size = 22, noAva = false }: { u: any; size?: number; noAva?: boolean }) {
  const { me, open } = useApp();
  if (!u?.id) return <span className="muted">—</span>;
  return (
    <button className={`nick${u.id === me.user.id ? ' me' : ''}`} onClick={(e) => { e.stopPropagation(); open(u.id); }}>
      {!noAva && <Avatar u={u} size={size} />}<span className="n">{u.id === me.user.id ? t('Ты') : who(u)}</span>
    </button>
  );
}

export function Spark({ data, up }: { data: number[]; up?: boolean }) {
  if (!data || data.length < 2) return <svg className="spark" />;
  const lo = Math.min(...data), hi = Math.max(...data), sp = hi - lo || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 64},${22 - ((v - lo) / sp) * 20}`).join(' ');
  return <svg className="spark" viewBox="0 0 64 24"><polyline points={pts} fill="none" stroke={up === false ? 'var(--red)' : 'var(--green)'} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /></svg>;
}

export function Delta({ v }: { v: number }) {
  return <span className={`delta ${v > 0 ? 'up' : v < 0 ? 'down' : 'flat'}`}>{v > 0 ? '▲' : v < 0 ? '▼' : '•'} {Math.abs(v).toLocaleString('ru-RU')}%</span>;
}

// Быстрый выбор получателя: друзья, приглашённые и с кем недавно были сделки.
export function FriendPicker({ value, onPick }: { value: string; onPick: (ref: string) => void }) {
  const [list, setList] = useState<any[] | null>(null);
  useEffect(() => { call('app_player', { action: 'friends' }).then((r) => setList(r.pick), () => setList([])); }, []);
  if (!list?.length) return list ? <div className="xs faint">{t('Добавь друзей в их профилях — они появятся здесь для быстрого выбора.')}</div> : null;
  return (
    <div className="hs">
      {list.map((f) => {
        const ref = f.username ? '@' + f.username : String(f.id);
        const on = value === ref;
        return (
          <button key={f.id} className={`chip${on ? ' on' : ''}`} style={{ height: 40, paddingLeft: 6 }} onClick={() => onPick(ref)}>
            <Avatar u={f} size={28} /> {who(f)}
          </button>
        );
      })}
    </div>
  );
}

// Выбор своей машины (гонка, рынок).
export function CarPicker({ value, onPick, exclude = [] as number[], only, auto }: { value: number | null; onPick: (c: any) => void; exclude?: number[]; only?: string[]; auto?: boolean }) {
  const [cars, setCars] = useState<any[] | null>(null);
  useEffect(() => { call('app_garage', { action: 'list' }).then((g) => setCars(g.cars), () => setCars([])); }, []);
  // auto — сразу выбрать первую (самую дорогую) машину, чтобы не нажимать лишний раз
  useEffect(() => { if (auto && value == null && cars?.length) { const c = cars.find((x) => !exclude.includes(x.user_car_id) && (!only || only.includes(x.rarity))); if (c) onPick(c); } }, [cars]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!cars) return <div className="sm muted">{t('Загрузка гаража…')}</div>;
  const list = cars.filter((c) => !exclude.includes(c.user_car_id) && (!only || only.includes(c.rarity)));
  if (!list.length) return <div className="sm muted">{t('В гараже нет машин — выиграй контейнер на аукционе.')}</div>;
  return (
    <div className="hs">
      {list.map((c) => (
        <button key={c.user_car_id} className={`carcard mini press r-${c.rarity}`} style={value === c.user_car_id ? { outline: '2px solid var(--orange)', outlineOffset: 2 } : undefined} onClick={() => onPick(c)}>
          <CarArt car={c} height={54} />
          <div className="sm sb l2">{c.name}</div>
          <div className="xs muted">{money(c.price)}</div>
        </button>
      ))}
    </div>
  );
}
