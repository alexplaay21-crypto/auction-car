// sound.ts — короткие звуки игры (синтез WebAudio, без файлов) и вибрация Telegram.
// Включаются и выключаются в настройках.
import { tg } from './tg';

let soundOn = true, hapticsOn = true;
let ctx: AudioContext | null = null;
export function setFx(s: { sound?: number | boolean; haptics?: number | boolean }) {
  if (s.sound != null) soundOn = !!s.sound;
  if (s.haptics != null) hapticsOn = !!s.haptics;
}

function tone(freq: number, dur: number, { type = 'sine' as OscillatorType, gain = 0.06, at = 0, slide = 0 } = {}) {
  if (!soundOn) return;
  try {
    ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    const t0 = ctx.currentTime + at;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t0 + dur);
    g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ctx.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  } catch { /* звук недоступен */ }
}

export const fx = {
  tap() { tone(520, 0.05, { type: 'triangle', gain: 0.03 }); vibrate('light'); },
  bid() { tone(660, 0.08, { type: 'square', gain: 0.03 }); tone(990, 0.1, { type: 'square', gain: 0.025, at: 0.07 }); vibrate('medium'); },
  tick() { tone(880, 0.04, { type: 'triangle', gain: 0.025 }); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, { type: 'triangle', gain: 0.05, at: i * 0.11 })); notify('success'); },
  coin() { tone(1200, 0.08, { gain: 0.04 }); tone(1600, 0.12, { gain: 0.035, at: 0.06 }); notify('success'); },
  error() { tone(220, 0.18, { type: 'sawtooth', gain: 0.03, slide: 0.7 }); notify('error'); },
  engine() { tone(90, 0.9, { type: 'sawtooth', gain: 0.03, slide: 2.6 }); vibrate('heavy'); },
  // контейнер дрожит: чем реже машина, тем дольше и ниже гул
  rumble(r: string) {
    const n = { common: 2, rare: 3, epic: 5, mythic: 8, mystic: 10 }[r] ?? 2;
    for (let i = 0; i < n; i++) { tone(70 + i * 6, 0.16, { type: 'sawtooth', gain: 0.025, at: i * 0.18 }); setTimeout(() => vibrate(i === n - 1 ? 'heavy' : 'light'), i * 180); }
  },
  // засовы и скрип дверей
  doors() { tone(140, 0.08, { type: 'square', gain: 0.04 }); tone(300, 0.5, { type: 'sawtooth', gain: 0.018, slide: 0.55, at: 0.08 }); vibrate('medium'); },
  // появление машины: у легендарной — фанфары
  reveal(r: string) {
    if (r === 'mystic') { // низкий аккорд и колокол — звучит иначе, чем легендарная
      [220, 262, 330, 392, 523, 659].forEach((f, i) => tone(f, 0.4, { type: 'triangle', gain: 0.06, at: i * 0.14 }));
      tone(1319, 1.2, { type: 'sine', gain: 0.045, at: 0.9 }); tone(110, 1.1, { type: 'sawtooth', gain: 0.02, at: 0.1 });
      notify('success'); [0, 250, 500, 800].forEach((d) => setTimeout(() => vibrate('heavy'), d));
    } else if (r === 'mythic') {
      [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.32, { type: 'triangle', gain: 0.06, at: i * 0.12 }));
      tone(1568, 0.9, { type: 'sine', gain: 0.04, at: 0.75 }); notify('success'); [0, 250, 500].forEach((d) => setTimeout(() => vibrate('heavy'), d));
    } else if (r === 'epic') {
      [440, 554, 659, 880].forEach((f, i) => tone(f, 0.24, { type: 'triangle', gain: 0.05, at: i * 0.1 })); notify('success');
    } else if (r === 'rare') { tone(660, 0.18, { type: 'triangle', gain: 0.045 }); tone(990, 0.26, { type: 'triangle', gain: 0.04, at: 0.12 }); vibrate('medium'); }
    else { tone(587, 0.16, { type: 'triangle', gain: 0.04 }); vibrate('light'); }
  },
};

// Звук мотора на время заезда: set(0..1) — обороты, stop() — заглушить.
export function engineLoop(): { set(r: number): void; stop(): void } | null {
  if (!soundOn) return null;
  try {
    ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    const c = ctx, o = c.createOscillator(), o2 = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 650;
    g.gain.setValueAtTime(0, c.currentTime); g.gain.linearRampToValueAtTime(0.03, c.currentTime + 0.3);
    o.connect(f); o2.connect(f); f.connect(g).connect(c.destination); o.start(); o2.start();
    let stopped = false;
    return {
      set(r) { if (stopped) return; const fr = 42 + r * 150; o.frequency.setTargetAtTime(fr, c.currentTime, 0.04); o2.frequency.setTargetAtTime(fr / 2, c.currentTime, 0.04); f.frequency.setTargetAtTime(400 + r * 900, c.currentTime, 0.05); },
      stop() { if (stopped) return; stopped = true; g.gain.setTargetAtTime(0, c.currentTime, 0.12); setTimeout(() => { try { o.stop(); o2.stop(); } catch { /* уже остановлен */ } }, 700); },
    };
  } catch { return null; }
}

function vibrate(kind: 'light' | 'medium' | 'heavy') { if (hapticsOn) tg?.HapticFeedback?.impactOccurred?.(kind); }
function notify(kind: 'success' | 'error') { if (hapticsOn) tg?.HapticFeedback?.notificationOccurred?.(kind); }
export function select() { if (hapticsOn) tg?.HapticFeedback?.selectionChanged?.(); }
