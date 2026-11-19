// ui.tsx — компоненты в духе sBoard: стеклянная карточка, строка списка с иконкой-плашкой,
// заголовок раздела, плитки, сегменты, верхняя панель с «назад», плавающая нижняя панель.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronRight, ArrowLeft, type LucideIcon } from 'lucide-react';
import { tg } from './tg';

export function Card({ children, onClick, className = '', style }: { children: ReactNode; onClick?: () => void; className?: string; style?: any }) {
  if (onClick) return <button className={`card tap ${className}`} style={{ textAlign: 'left', width: '100%', ...style }} onClick={onClick}>{children}</button>;
  return <div className={`card ${className}`} style={style}>{children}</div>;
}

export function Badge({ icon: Icon, tone = '', size = 40 }: { icon: LucideIcon; tone?: string; size?: number }) {
  return <span className={`badge ${tone}`} style={{ width: size, height: size }}><Icon size={size * 0.5} strokeWidth={2.2} /></span>;
}

export function SectionTitle({ children, action, onAction }: { children: ReactNode; action?: string; onAction?: () => void }) {
  return (
    <div className="section">
      <span className="section-t">{children}</span>
      {action && onAction && <button className="section-a" onClick={onAction}>{action}</button>}
    </div>
  );
}

export function ListRow({ title, subtitle, icon, tone, leading, trailing, onClick, chevron = !!onClick }:
  { title: ReactNode; subtitle?: ReactNode; icon?: LucideIcon; tone?: string; leading?: ReactNode; trailing?: ReactNode; onClick?: () => void; chevron?: boolean }) {
  const body = (
    <>
      {leading ?? (icon ? <Badge icon={icon} tone={tone} size={38} /> : null)}
      <div className="grow col" style={{ gap: 2 }}>
        <div className="t-title-s ellipsis">{title}</div>
        {subtitle != null && <div className="t-small muted">{subtitle}</div>}
      </div>
      {trailing}
      {chevron && <ChevronRight size={18} className="chev" />}
    </>
  );
  return onClick ? <button className="list-row tap" onClick={onClick}>{body}</button> : <div className="list-row">{body}</div>;
}

export function StatusLine({ label, value, color }: { label: ReactNode; value: ReactNode; color?: string }) {
  return (
    <div className="status-line t-body">
      <span className="dot" style={{ background: color ?? 'var(--accent)' }} />
      <span className="grow muted">{label}</span>
      <span style={{ color: color ?? 'var(--text)', fontWeight: 600 }}>{value}</span>
    </div>
  );
}

export function ScreenHead({ brand, title, trailing }: { brand?: string; title: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="screen-head">
      <div className="grow">
        {brand && <div className="t-brand">{brand}</div>}
        <h1 className="t-headline ellipsis">{title}</h1>
      </div>
      {trailing}
    </div>
  );
}

// Верхняя панель вложенного экрана; системная кнопка «Назад» Telegram делает то же самое.
export function TopBar({ title, onBack, actions }: { title: ReactNode; onBack: () => void; actions?: ReactNode }) {
  useEffect(() => {
    const b = tg?.BackButton;
    if (!b) return;
    b.show(); b.onClick(onBack);
    return () => { b.offClick(onBack); b.hide(); };
  }, [onBack]);
  return (
    <div className="topbar">
      <button className="icon-btn" onClick={onBack} aria-label="Назад"><ArrowLeft size={22} /></button>
      <div className="t-title-l grow ellipsis">{title}</div>
      {actions}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="segmented">
      {options.map(([k, l]) => <button key={k} className={value === k ? 'on' : ''} onClick={() => { onChange(k); tg?.HapticFeedback?.selectionChanged?.(); }}>{l}</button>)}
    </div>
  );
}

export function Empty({ icon: Icon, title, text, action, onAction }: { icon: LucideIcon; title: string; text?: string; action?: string; onAction?: () => void }) {
  return (
    <Card>
      <div className="empty">
        <Badge icon={Icon} size={52} />
        <div className="t-title">{title}</div>
        {text && <div className="t-body muted">{text}</div>}
        {action && onAction && <button className="btn primary" onClick={onAction}>{action}</button>}
      </div>
    </Card>
  );
}

export function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <button className={`switch${on ? ' on' : ''}`} onClick={() => onChange(!on)} aria-pressed={on} />;
}

// Плавающая нижняя панель: подсветка скользит между вкладками, её можно тянуть пальцем —
// при отпускании открывается вкладка под пальцем (как FloatingNavBar в sBoard).
export function FloatingNav<T extends string>({ items, value, onChange }: { items: [T, LucideIcon, string][]; value: T; onChange: (v: T) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setW((el.clientWidth - 12) / items.length));
    ro.observe(el); return () => ro.disconnect();
  }, [items.length]);
  const idx = Math.max(0, items.findIndex((x) => x[0] === value));
  const hover = drag != null && w ? Math.min(items.length - 1, Math.max(0, Math.floor(drag / w))) : idx;
  const x = drag != null ? Math.min(w * (items.length - 1), Math.max(0, drag - w / 2)) : idx * w;
  const last = useRef(hover);
  useEffect(() => { if (drag != null && last.current !== hover) tg?.HapticFeedback?.selectionChanged?.(); last.current = hover; }, [hover, drag]);
  const pos = (e: React.PointerEvent) => e.clientX - (ref.current!.getBoundingClientRect().left + 6);
  return (
    <div className="nav-wrap">
      <div className="nav" ref={ref}
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); setDrag(pos(e)); }}
        onPointerMove={(e) => { if (drag != null) setDrag(pos(e)); }}
        onPointerUp={() => { if (drag != null) { const t = items[hover][0]; setDrag(null); if (t !== value) onChange(t); else onChange(t); } }}
        onPointerCancel={() => setDrag(null)}>
        <div className={`nav-pill${drag != null ? ' drag' : ''}`} style={{ width: w, transform: `translateX(${x}px) scale(${drag != null ? 1.08 : 1}, ${drag != null ? 1.12 : 1})` }} />
        {items.map(([k, Icon, label], i) => (
          <button key={k} className={i === hover ? 'on' : ''} aria-label={label}>
            <Icon size={22} strokeWidth={2.1} />
            <span className="nl">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
