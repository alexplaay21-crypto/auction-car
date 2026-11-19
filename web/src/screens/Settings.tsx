import { useState } from 'react';
import { Languages, Volume2, Vibrate, Gavel, Handshake, Flag } from 'lucide-react';
import { call, errorText, toast } from '../tg';
import { t, setLang } from '../i18n';
import { setFx, fx } from '../sound';
import { AppBar, Sect, Li, Seg } from '../ui';
import { useApp } from '../App';

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <button className={`switch${on ? ' on' : ''}`} onClick={() => onChange(!on)} aria-pressed={on} />;
}

// Настройки игрока: язык, звук, вибрация, уведомления в боте. Хранятся на сервере.
export function SettingsPage() {
  const { me, pop, reload } = useApp();
  const [s, setS] = useState<any>(me.settings ?? { lang: 'ru', sound: 1, haptics: 1, n_auction: 1, n_deals: 1, n_races: 1 });
  const save = async (patch: any) => {
    const next = { ...s, ...patch };
    setS(next); setFx(next);
    if (patch.lang) setLang(patch.lang);
    try { await call('app_player', { action: 'save_settings', settings: patch }); await reload(); if (patch.sound) fx.coin(); } catch (e) { toast(errorText(e)); }
  };
  return (
    <>
      <AppBar title={t('Настройки')} back={pop} />
      <div className="page">
        <Sect>{t('Язык')}</Sect>
        <div className="card"><Li icon={Languages} tone="blue" title={t('Язык интерфейса')} /><Seg value={s.lang} onChange={(v) => save({ lang: v })} options={[['ru', 'Русский'], ['en', 'English']]} /></div>
        <Sect>{t('Звук и вибрация')}</Sect>
        <div className="card list">
          <Li icon={Volume2} title={t('Звуки')} sub={t('Ставки, победы, монеты')} right={<Toggle on={!!s.sound} onChange={(v) => save({ sound: v ? 1 : 0 })} />} />
          <Li icon={Vibrate} tone="blue" title={t('Вибрация')} right={<Toggle on={!!s.haptics} onChange={(v) => save({ haptics: v ? 1 : 0 })} />} />
        </div>
        <Sect>{t('Уведомления в боте')}</Sect>
        <div className="card list">
          <Li icon={Gavel} tone="gold" title={t('Аукцион')} sub={t('Выигранные контейнеры, выход из комнаты')} right={<Toggle on={!!s.n_auction} onChange={(v) => save({ n_auction: v ? 1 : 0 })} />} />
          <Li icon={Handshake} tone="green" title={t('Сделки')} sub={t('Предложения, продажи на рынке, переводы')} right={<Toggle on={!!s.n_deals} onChange={(v) => save({ n_deals: v ? 1 : 0 })} />} />
          <Li icon={Flag} tone="blue" title={t('Гонки')} sub={t('Кто-то принял твой вызов')} right={<Toggle on={!!s.n_races} onChange={(v) => save({ n_races: v ? 1 : 0 })} />} />
        </div>
      </div>
    </>
  );
}
