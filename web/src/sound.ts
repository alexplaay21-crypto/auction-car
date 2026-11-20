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
    const n = { common: 2, rare: 3, epic: 5, mythic: 8 }[r] ?? 2;
    for (let i = 0; i < n; i++) { tone(70 + i * 6, 0.16, { type: 'sawtooth', gain: 0.025, at: i * 0.18 }); setTimeout(() => vibrate(i === n - 1 ? 'heavy' : 'light'), i * 180); }
  },
  // засовы и скрип дверей
  doors() { tone(140, 0.08, { type: 'square', gain: 0.04 }); tone(300, 0.5, { type: 'sawtooth', gain: 0.018, slide: 0.55, at: 0.08 }); vibrate('medium'); },
  // появление машины: у легендарной — фанфары
  reveal(r: string) {
    if (r === 'mythic') {
      [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.32, { type: 'triangle', gain: 0.06, at: i * 0.12 }));
      tone(1568, 0.9, { type: 'sine', gain: 0.04, at: 0.75 }); notify('success'); [0, 250, 500].forEach((d) => setTimeout(() => vibrate('heavy'), d));
    } else if (r === 'epic') {
      [440, 554, 659, 880].forEach((f, i) => tone(f, 0.24, { type: 'triangle', gain: 0.05, at: i * 0.1 })); notify('success');
    } else if (r === 'rare') { tone(660, 0.18, { type: 'triangle', gain: 0.045 }); tone(990, 0.26, { type: 'triangle', gain: 0.04, at: 0.12 }); vibrate('medium'); }
    else { tone(587, 0.16, { type: 'triangle', gain: 0.04 }); vibrate('light'); }
  },
};

function vibrate(kind: 'light' | 'medium' | 'heavy') { if (hapticsOn) tg?.HapticFeedback?.impactOccurred?.(kind); }
function notify(kind: 'success' | 'error') { if (hapticsOn) tg?.HapticFeedback?.notificationOccurred?.(kind); }
export function select() { if (hapticsOn) tg?.HapticFeedback?.selectionChanged?.(); }
