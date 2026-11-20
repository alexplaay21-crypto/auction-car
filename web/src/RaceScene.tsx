// RaceScene.tsx — заезд «как в игре»: вид сзади на две машины на трассе (псевдо-3D на canvas).
// Светофор → пробуксовка с дымом → разгон (спидометр, передачи, полосы скорости) → финишная арка.
// Результат заезда уже посчитан сервером: машины просто проезжают дистанцию за время,
// пропорциональное своему результату, поэтому кто первым пересёк черту — тот и победил.
import { useEffect, useRef } from 'react';
import { engineLoop, fx } from './sound';
import { t } from './i18n';

export type SceneCar = { name?: string; color?: string; body?: string; rarity?: string; max_speed?: number };
type Props = { track: string; me: SceneCar; rival: SceneCar; meMs: number; rivalMs: number; rivalName: string; onEnd: () => void };

type Theme = {
  sky: string[]; haze: string; grass: [string, string]; road: [string, string]; rumble: [string, string];
  line: string | null; curve: number; L: number; dur: number; night?: boolean; dust?: boolean; scenery: 'city' | 'stands' | 'hills';
};
const THEME: Record<string, Theme> = {
  drag: { sky: ['#07061a', '#24103f', '#7a2a55', '#ff8a3d'], haze: '#5a2448', grass: ['#101218', '#13161d'], road: ['#24272e', '#282b33'], rumble: ['#e9e9ec', '#d23b3b'],
    line: '#f4f4f4', curve: 0, L: 402, dur: 4.4, night: true, scenery: 'city' },
  circuit: { sky: ['#1f6fd0', '#5aa6ec', '#a9d6f7', '#e4f3fd'], haze: '#cfe6f6', grass: ['#3c8c37', '#44973e'], road: ['#4a4d55', '#4f525a'], rumble: ['#f3f3f3', '#d6262b'],
    line: '#ffffff', curve: 0.0032, L: 700, dur: 5.0, scenery: 'stands' },
  rally: { sky: ['#2c2350', '#7a4a78', '#e0785a', '#ffcf86'], haze: '#e6a777', grass: ['#5f7234', '#677b39'], road: ['#93714c', '#9b7852'], rumble: ['#7a5c3c', '#846448'],
    line: null, curve: 0.0055, L: 700, dur: 5.0, dust: true, scenery: 'hills' },
};

// пропорции кузова (в ширинах машины): высота кузова, высота кабины, ширина крыши
const BODY: Record<string, { h: number; cab: number; top: number; wing?: boolean; bar?: boolean }> = {
  hatch: { h: 0.44, cab: 0.3, top: 0.66 }, sedan: { h: 0.42, cab: 0.28, top: 0.62 }, wagon: { h: 0.43, cab: 0.3, top: 0.7 },
  suv: { h: 0.54, cab: 0.32, top: 0.7 }, van: { h: 0.58, cab: 0.36, top: 0.8 }, coupe: { h: 0.37, cab: 0.24, top: 0.56, bar: true },
  roadster: { h: 0.36, cab: 0.16, top: 0.5, bar: true }, super: { h: 0.31, cab: 0.19, top: 0.52, wing: true, bar: true },
};

const K = 3.2; // как быстро машина выходит на максимальную скорость
const g = (u: number) => u - (1 - Math.exp(-K * u)) / K;
const G1 = g(1);
const CAM_H = 1.6, HALF = 3.1, LANE = 1.45, Z_FAR = 330, SEG = 3, COUNT = 1.7;

function rgb(hex: string | undefined): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  const n = m ? parseInt(m[1], 16) : 0x8a96a3;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shade(c: [number, number, number], k: number, a = 1) {
  const f = (v: number) => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k));
  return `rgba(${f(c[0])},${f(c[1])},${f(c[2])},${a})`;
}
const md = (a: number, n: number) => ((a % n) + n) % n;
const rnd = (i: number) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

type Run = { T: number; s: number; v: number; kmh: number; gear: number; flame: number; done: boolean };

export function RaceScene({ track, me, rival, meMs, rivalMs, rivalName, onEnd }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const skipRef = useRef(false);
  const endRef = useRef(onEnd);
  endRef.current = onEnd;

  useEffect(() => {
    const cv = ref.current!;
    const W = cv.clientWidth || 360;
    const H = Math.round(Math.max(220, Math.min(300, W * 0.66)));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = W * dpr; cv.height = H * dpr; cv.style.height = `${H}px`;
    const ctx = cv.getContext('2d')!;
    ctx.scale(dpr, dpr);
    const font = getComputedStyle(document.body).fontFamily || 'sans-serif';
    const th = THEME[track] ?? THEME.drag;
    const F = H * 1.25, HOR = Math.round(H * 0.42);
    const fast = Math.min(meMs, rivalMs);
    const runs: Run[] = [meMs, rivalMs].map((ms) => ({ T: th.dur * (ms / fast), s: 0, v: 0, kmh: 0, gear: 0, flame: 0, done: false }));
    const cars = [me, rival];
    const lanes = [-LANE, LANE];
    // итог — как только финишировал игрок (соперника ждём не дольше 0,8 с)
    const tEnd = COUNT + Math.min(th.dur * 1.6, Math.max(runs[0].T, Math.min(runs[1].T, runs[0].T + 0.8))) + 0.8;
    const photo = Math.abs(meMs - rivalMs) / fast < 0.01;
    type P = { s: number; x: number; y: number; r: number; born: number; life: number; vx: number; dust: boolean };
    let smoke: P[] = [];
    let lastLight = 0, ended = false, raf = 0, last = performance.now(), time = 0, camS = -7, shake = 0, finishAt = -1;
    const eng = engineLoop();

    // положение и скорость машины в момент t (сек от начала сцены)
    const step = (r: Run, car: SceneCar, tt: number) => {
      const top = car.max_speed || 220;
      const u = (tt - COUNT) / r.T;
      if (u <= 0) { r.s = 0; r.v = 0; r.kmh = 0; return; }
      const vEnd = (th.L * (1 - Math.exp(-K))) / G1 / r.T;
      if (u <= 1) {
        r.s = (th.L * g(u)) / G1;
        r.v = (th.L * (1 - Math.exp(-K * u))) / G1 / r.T;
        r.kmh = (top * 0.94 * (1 - Math.exp(-K * u))) / (1 - Math.exp(-K));
      } else { // после финиша — плавно тормозит
        r.done = true;
        const tau = (u - 1) * r.T, a = vEnd / 2.2, tt2 = Math.min(tau, 2.2);
        r.s = th.L + vEnd * tt2 - 0.5 * a * tt2 * tt2;
        r.v = Math.max(0, vEnd - a * tau);
        r.kmh = top * 0.94 * (r.v / vEnd);
      }
      const gear = Math.min(6, 1 + Math.floor((r.kmh / top) * 6.2));
      if (gear > r.gear && r.gear > 0) r.flame = car.rarity === 'epic' || car.rarity === 'mythic' ? 1 : 0.55;
      r.gear = gear;
    };

    // проекция точки дороги: s — метры по трассе, x — метры вбок
    const curveK = (s: number) => th.curve * Math.sin(s / 90);
    const proj = (s: number, x: number, y = 0) => {
      const z = s - camS;
      const sc = F / z;
      const bend = 0.5 * curveK(camS) * z * z;
      return { X: W / 2 + (x + bend) * sc, Y: HOR + (CAM_H - y) * sc, sc, z };
    };

    const poly = (pts: [number, number][], fill: string) => {
      ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath(); ctx.fill();
    };
    // полоса поперёк дороги от s1 до s2, от x1 до x2 (метры)
    const strip = (s1: number, s2: number, x1: number, x2: number, fill: string) => {
      if (s1 - camS < 1 || s2 - camS < 1) return;
      const a = proj(s1, x1), b = proj(s1, x2), c = proj(s2, x2), d = proj(s2, x1);
      poly([[a.X, a.Y], [b.X, b.Y], [c.X, c.Y], [d.X, d.Y]], fill);
    };

    const drawSky = () => {
      const gr = ctx.createLinearGradient(0, 0, 0, HOR);
      th.sky.forEach((c, i) => gr.addColorStop(i / (th.sky.length - 1), c));
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, HOR + 1);
      // поворот дороги сдвигает горизонт
      const heading = -th.curve * 90 * Math.cos(camS / 90);
      const shift = ((heading * F) % W + W) % W;
      ctx.save();
      for (let rep = -1; rep <= 1; rep++) {
        const ox = rep * W + shift - W / 2;
        if (th.scenery === 'city') {
          for (let i = 0; i < 26; i++) {
            const bw = W / 26 + rnd(i) * 10, bh = 10 + rnd(i + 50) * HOR * 0.38, bx = ox + i * (W / 26);
            ctx.fillStyle = '#0c0a1a'; ctx.fillRect(bx, HOR - bh, bw, bh);
            ctx.fillStyle = 'rgba(255,210,120,.55)';
            for (let w = 0; w < 6; w++) if (rnd(i * 7 + w) > 0.55) ctx.fillRect(bx + 2 + rnd(i * 3 + w) * (bw - 5), HOR - bh + 3 + rnd(i * 11 + w) * (bh - 6), 1.5, 1.5);
          }
        } else if (th.scenery === 'stands') {
          ctx.fillStyle = '#6f9e5c';
          ctx.beginPath(); ctx.moveTo(ox, HOR);
          for (let i = 0; i <= 12; i++) ctx.lineTo(ox + (i * W) / 12, HOR - 8 - rnd(i + 3) * 16);
          ctx.lineTo(ox + W, HOR); ctx.fill();
          // трибуна
          ctx.fillStyle = '#d7dde4'; ctx.fillRect(ox + W * 0.58, HOR - 20, W * 0.3, 20);
          ctx.fillStyle = '#3d4a5c'; ctx.fillRect(ox + W * 0.58, HOR - 24, W * 0.3, 5);
          for (let i = 0; i < 40; i++) { ctx.fillStyle = ['#e64545', '#3b7ddd', '#f2c230', '#ffffff'][i % 4]; ctx.fillRect(ox + W * 0.59 + rnd(i) * W * 0.28, HOR - 17 + rnd(i + 9) * 14, 2, 2); }
        } else {
          ctx.fillStyle = '#5b3d63';
          ctx.beginPath(); ctx.moveTo(ox, HOR);
          for (let i = 0; i <= 8; i++) ctx.lineTo(ox + (i * W) / 8, HOR - 18 - rnd(i + 21) * HOR * 0.4);
          ctx.lineTo(ox + W, HOR); ctx.fill();
          ctx.fillStyle = '#3f3150';
          ctx.beginPath(); ctx.moveTo(ox, HOR);
          for (let i = 0; i <= 14; i++) ctx.lineTo(ox + (i * W) / 14, HOR - 6 - rnd(i + 70) * 18);
          ctx.lineTo(ox + W, HOR); ctx.fill();
        }
      }
      if (th.scenery === 'hills') { // солнце
        const sx = W * 0.72 + shift * 0.2 - W * 0.1, sy = HOR - 26;
        const sg = ctx.createRadialGradient(sx, sy, 2, sx, sy, 60);
        sg.addColorStop(0, 'rgba(255,240,190,.95)'); sg.addColorStop(0.25, 'rgba(255,200,120,.5)'); sg.addColorStop(1, 'rgba(255,170,90,0)');
        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = sg; ctx.fillRect(sx - 60, sy - 60, 120, 120); ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
    };

    const drawRoad = () => {
      const j0 = Math.floor((camS + 1) / SEG), j1 = Math.floor((camS + Z_FAR) / SEG);
      for (let j = j1; j >= j0; j--) {
        const s1 = Math.max(j * SEG, camS + 1), s2 = (j + 1) * SEG;
        const a = proj(s1, 0), b = proj(s2, 0);
        if (a.Y < HOR) continue;
        const wA = HALF * a.sc, wB = HALF * b.sc;
        ctx.fillStyle = th.grass[md(Math.floor(j / 3), 2)]; ctx.fillRect(0, b.Y, W, a.Y - b.Y + 1);
        poly([[a.X - wA * 1.13, a.Y], [a.X + wA * 1.13, a.Y], [b.X + wB * 1.13, b.Y], [b.X - wB * 1.13, b.Y]], th.rumble[md(j, 2)]);
        poly([[a.X - wA, a.Y], [a.X + wA, a.Y], [b.X + wB, b.Y], [b.X - wB, b.Y]], th.road[md(Math.floor(j / 2), 2)]);
        if (th.line) {
          if (md(j, 4) < 2) poly([[a.X - 0.07 * a.sc, a.Y], [a.X + 0.07 * a.sc, a.Y], [b.X + 0.07 * b.sc, b.Y], [b.X - 0.07 * b.sc, b.Y]], th.line);
          const e = 0.93; // боковые линии
          poly([[a.X - wA * e, a.Y], [a.X - wA * (e - 0.03), a.Y], [b.X - wB * (e - 0.03), b.Y], [b.X - wB * e, b.Y]], 'rgba(255,255,255,.75)');
          poly([[a.X + wA * (e - 0.03), a.Y], [a.X + wA * e, a.Y], [b.X + wB * e, b.Y], [b.X + wB * (e - 0.03), b.Y]], 'rgba(255,255,255,.75)');
        } else if (th.dust) { // колея на грунте
          for (const x of [-LANE, LANE]) poly([[a.X + (x - 0.5) * a.sc, a.Y], [a.X + (x + 0.5) * a.sc, a.Y], [b.X + (x + 0.5) * b.sc, b.Y], [b.X + (x - 0.5) * b.sc, b.Y]], 'rgba(70,48,30,.18)');
        }
      }
      // старт и финиш
      if (-camS > 3) strip(0, 0.5, -HALF, HALF, 'rgba(255,255,255,.9)');
      const n = 14;
      for (let row = 0; row < 3; row++) for (let i = 0; i < n; i++) {
        strip(th.L + row * 0.9, th.L + (row + 1) * 0.9, -HALF + (i * 2 * HALF) / n, -HALF + ((i + 1) * 2 * HALF) / n, (i + row) % 2 ? '#111' : '#f4f4f4');
      }
      // дымка у горизонта
      const hz = ctx.createLinearGradient(0, HOR - 12, 0, HOR + 26);
      hz.addColorStop(0, shade(rgb(th.haze), 0, 0)); hz.addColorStop(0.35, shade(rgb(th.haze), 0, th.night ? 0.55 : 0.75)); hz.addColorStop(1, shade(rgb(th.haze), 0, 0));
      ctx.fillStyle = hz; ctx.fillRect(0, HOR - 12, W, 38);
    };

    // машина сзади: cx — центр, gy — линия земли, w — ширина в пикселях
    const drawCar = (cx: number, gy: number, w: number, car: SceneCar, r: Run, mine: boolean, label: string) => {
      const c = rgb(car.color);
      const b = BODY[car.body ?? ''] ?? BODY.sedan;
      const X = (x: number) => cx + x * w, Y = (y: number) => gy - y * w;
      const rr = (x1: number, y1: number, x2: number, y2: number, rad: number, fill: string | CanvasGradient) => {
        ctx.fillStyle = fill; ctx.beginPath();
        (ctx as any).roundRect ? (ctx as any).roundRect(X(x1), Y(y2), (x2 - x1) * w, (y2 - y1) * w, rad * w) : ctx.rect(X(x1), Y(y2), (x2 - x1) * w, (y2 - y1) * w);
        ctx.fill();
      };
      // тень
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.ellipse(cx, gy, w * 0.62, w * 0.07, 0, 0, Math.PI * 2); ctx.fill();
      // колёса
      rr(-0.5, 0, -0.35, 0.23, 0.04, '#0c0d10'); rr(0.35, 0, 0.5, 0.23, 0.04, '#0c0d10');
      rr(-0.48, 0.03, -0.37, 0.07, 0.01, '#23252b'); rr(0.37, 0.03, 0.48, 0.07, 0.01, '#23252b');
      // кузов
      const gr = ctx.createLinearGradient(0, Y(b.h), 0, Y(0.1));
      gr.addColorStop(0, shade(c, 0.28)); gr.addColorStop(0.35, shade(c, 0)); gr.addColorStop(1, shade(c, -0.45));
      ctx.fillStyle = gr; ctx.beginPath();
      ctx.moveTo(X(-0.5), Y(0.12)); ctx.lineTo(X(-0.505), Y(b.h * 0.7)); ctx.quadraticCurveTo(X(-0.5), Y(b.h), X(-0.44), Y(b.h));
      ctx.lineTo(X(0.44), Y(b.h)); ctx.quadraticCurveTo(X(0.5), Y(b.h), X(0.505), Y(b.h * 0.7)); ctx.lineTo(X(0.5), Y(0.12));
      ctx.quadraticCurveTo(X(0.5), Y(0.09), X(0.46), Y(0.09)); ctx.lineTo(X(-0.46), Y(0.09)); ctx.quadraticCurveTo(X(-0.5), Y(0.09), X(-0.5), Y(0.12));
      ctx.fill();
      // кабина и заднее стекло
      const tw = b.top / 2, bw = 0.43;
      const cg = ctx.createLinearGradient(0, Y(b.h + b.cab), 0, Y(b.h));
      cg.addColorStop(0, shade(c, 0.35)); cg.addColorStop(1, shade(c, -0.1));
      poly([[X(-bw), Y(b.h - 0.005)], [X(bw), Y(b.h - 0.005)], [X(tw), Y(b.h + b.cab)], [X(-tw), Y(b.h + b.cab)]], cg as any);
      const glass = ctx.createLinearGradient(0, Y(b.h + b.cab), 0, Y(b.h));
      glass.addColorStop(0, th.night ? '#1b2434' : '#4b5c70'); glass.addColorStop(1, '#0d1118');
      poly([[X(-bw + 0.06), Y(b.h + 0.025)], [X(bw - 0.06), Y(b.h + 0.025)], [X(tw - 0.045), Y(b.h + b.cab - 0.035)], [X(-tw + 0.045), Y(b.h + b.cab - 0.035)]], glass as any);
      ctx.fillStyle = 'rgba(255,255,255,.13)';
      ctx.beginPath(); ctx.moveTo(X(-bw + 0.12), Y(b.h + 0.03)); ctx.lineTo(X(-bw + 0.22), Y(b.h + 0.03)); ctx.lineTo(X(-tw + 0.16), Y(b.h + b.cab - 0.04)); ctx.lineTo(X(-tw + 0.09), Y(b.h + b.cab - 0.04)); ctx.fill();
      // зеркала
      rr(-0.56, b.h + 0.02, -0.47, b.h + 0.07, 0.015, shade(c, -0.15)); rr(0.47, b.h + 0.02, 0.56, b.h + 0.07, 0.015, shade(c, -0.15));
      // крышка багажника, ниша номера (пустая), бампер, диффузор
      ctx.strokeStyle = shade(c, -0.4); ctx.lineWidth = Math.max(1, w * 0.012);
      ctx.beginPath(); ctx.moveTo(X(-0.36), Y(b.h - 0.16)); ctx.lineTo(X(0.36), Y(b.h - 0.16)); ctx.stroke();
      rr(-0.11, 0.2, 0.11, 0.29, 0.015, shade(c, -0.5));
      rr(-0.44, 0.09, 0.44, 0.17, 0.03, '#15171b');
      const ex = b.wing ? [-0.07, 0.07] : [-0.3, 0.3];
      for (const x of ex) { ctx.fillStyle = '#6b6f78'; ctx.beginPath(); ctx.ellipse(X(x), Y(0.13), w * 0.04, w * 0.026, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#0a0a0c'; ctx.beginPath(); ctx.ellipse(X(x), Y(0.13), w * 0.026, w * 0.016, 0, 0, Math.PI * 2); ctx.fill(); }
      // фонари
      ctx.save();
      ctx.shadowColor = '#ff2a2a'; ctx.shadowBlur = w * (th.night ? 0.32 : 0.14);
      const ly = b.h - 0.08, lh = 0.055;
      const lg = ctx.createLinearGradient(0, Y(ly + lh / 2), 0, Y(ly - lh / 2));
      lg.addColorStop(0, '#ff6b6b'); lg.addColorStop(1, '#b3121b');
      rr(-0.48, ly - lh / 2, -0.25, ly + lh / 2, 0.012, lg); rr(0.25, ly - lh / 2, 0.48, ly + lh / 2, 0.012, lg);
      if (b.bar) rr(-0.25, ly - 0.01, 0.25, ly + 0.01, 0.005, '#e22a2a');
      ctx.restore();
      // антикрыло
      if (b.wing) {
        rr(-0.27, b.h - 0.02, -0.23, b.h + 0.07, 0, '#16181c'); rr(0.23, b.h - 0.02, 0.27, b.h + 0.07, 0, '#16181c');
        rr(-0.5, b.h + 0.07, 0.5, b.h + 0.11, 0.01, '#1c1e23');
      }
      // выхлоп — вспышка на переключении
      if (r.flame > 0.02) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (const x of ex) {
          const fr = w * 0.1 * (0.6 + r.flame);
          const fg = ctx.createRadialGradient(X(x), Y(0.13), 0, X(x), Y(0.13), fr);
          fg.addColorStop(0, `rgba(255,255,230,${r.flame})`); fg.addColorStop(0.35, `rgba(255,150,40,${r.flame * 0.9})`); fg.addColorStop(0.7, `rgba(80,120,255,${r.flame * 0.35})`); fg.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = fg; ctx.fillRect(X(x) - fr, Y(0.13) - fr, fr * 2, fr * 2);
        }
        ctx.restore();
      }
      // подпись
      if (w > 26) {
        ctx.font = `800 ${Math.max(9, Math.min(12, w * 0.15))}px ${font}`;
        const tw2 = ctx.measureText(label).width + 10, ty = Y(b.h + b.cab + 0.1) - 14;
        ctx.fillStyle = mine ? 'rgba(255,122,26,.92)' : 'rgba(20,22,28,.78)';
        ctx.beginPath(); (ctx as any).roundRect ? (ctx as any).roundRect(cx - tw2 / 2, ty, tw2, 15, 7) : ctx.rect(cx - tw2 / 2, ty, tw2, 15); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, cx, ty + 8);
      }
    };

    const drawProps = (items: { z: number; draw: () => void }[]) => {
      const sFrom = Math.ceil((camS + 2) / 30) * 30;
      for (let s = sFrom; s < camS + Z_FAR * 0.8; s += 30) {
        for (const side of [-1, 1]) {
          const k = Math.round(s / 30) * 2 + (side > 0 ? 1 : 0);
          items.push({ z: s - camS, draw: () => {
            if (th.scenery === 'hills') { // деревья
              const x = side * (HALF + 2.5 + rnd(k) * 5), hgt = 5 + rnd(k + 3) * 4;
              const p = proj(s, x), top = proj(s, x, hgt);
              ctx.fillStyle = '#3b2a1e'; ctx.fillRect(p.X - 0.15 * p.sc, top.Y + (p.Y - top.Y) * 0.6, 0.3 * p.sc, (p.Y - top.Y) * 0.4);
              for (let l = 0; l < 2; l++) {
                const y0 = top.Y + (p.Y - top.Y) * (0.25 + l * 0.33);
                poly([[p.X, top.Y + (p.Y - top.Y) * l * 0.25], [p.X + 1.6 * p.sc, y0 + (p.Y - top.Y) * 0.25], [p.X - 1.6 * p.sc, y0 + (p.Y - top.Y) * 0.25]], l ? '#2e4a26' : '#38592d');
              }
            } else { // фонари / столбы
              const x = side * (HALF + 1.1), p = proj(s, x), top = proj(s, x, 6.5);
              ctx.fillStyle = th.night ? '#2b2f38' : '#8b939e';
              ctx.fillRect(p.X - Math.max(0.6, 0.08 * p.sc), top.Y, Math.max(1.2, 0.16 * p.sc), p.Y - top.Y);
              const arm = proj(s, x - side * 1.4, 6.5);
              ctx.fillRect(Math.min(arm.X, top.X), top.Y - Math.max(0.6, 0.05 * p.sc), Math.abs(arm.X - top.X), Math.max(1.2, 0.1 * p.sc));
              if (th.night) {
                const lg = ctx.createRadialGradient(arm.X, arm.Y + 2, 0, arm.X, arm.Y + 2, 1.6 * p.sc);
                lg.addColorStop(0, 'rgba(255,220,150,.9)'); lg.addColorStop(1, 'rgba(255,200,120,0)');
                ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = lg; ctx.fillRect(arm.X - 1.6 * p.sc, arm.Y + 2 - 1.6 * p.sc, 3.2 * p.sc, 3.2 * p.sc); ctx.restore();
              }
            }
          } });
        }
      }
      // таблички «осталось N м»
      for (const left of [300, 200, 100]) {
        const s = th.L - left;
        if (s - camS < 2 || s - camS > Z_FAR * 0.7) continue;
        for (const side of [-1, 1]) items.push({ z: s - camS, draw: () => {
          const x = side * (HALF + 2.2), a = proj(s, x - 0.9, 2.6), b = proj(s, x + 0.9, 1.4), leg = proj(s, x);
          ctx.fillStyle = '#2a2d34'; ctx.fillRect(leg.X - 0.05 * leg.sc, b.Y, Math.max(1, 0.1 * leg.sc), leg.Y - b.Y);
          ctx.fillStyle = '#f4f4f4'; ctx.fillRect(a.X, a.Y, b.X - a.X, b.Y - a.Y);
          ctx.fillStyle = '#d23b3b'; ctx.fillRect(a.X, a.Y, b.X - a.X, (b.Y - a.Y) * 0.18);
          if (b.X - a.X > 14) { ctx.fillStyle = '#111'; ctx.font = `900 ${(b.Y - a.Y) * 0.55}px ${font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(left), (a.X + b.X) / 2, a.Y + (b.Y - a.Y) * 0.6); }
        } });
      }
      // финишная арка
      const fz = th.L - camS;
      if (fz > 1.5 && fz < Z_FAR) items.push({ z: fz, draw: () => {
        const xl = -HALF - 0.7, xr = HALF + 0.7;
        const pl = proj(th.L, xl), pr = proj(th.L, xr), tl = proj(th.L, xl, 5.6), br = proj(th.L, xr, 4.3);
        const pw = Math.max(1.5, 0.3 * pl.sc);
        ctx.fillStyle = '#d9dde3'; ctx.fillRect(pl.X - pw / 2, tl.Y, pw, pl.Y - tl.Y); ctx.fillRect(pr.X - pw / 2, tl.Y, pw, pr.Y - tl.Y);
        const bw2 = br.X - tl.X, bh = br.Y - tl.Y, n = 20;
        for (let row = 0; row < 2; row++) for (let i = 0; i < n; i++) {
          ctx.fillStyle = (i + row) % 2 ? '#111' : '#f4f4f4';
          ctx.fillRect(tl.X + (i * bw2) / n, tl.Y + (row * bh) / 2, bw2 / n + 0.5, bh / 2 + 0.5);
        }
        if (bw2 > 60) {
          const mw = bw2 * 0.42;
          ctx.fillStyle = '#d23b3b'; ctx.fillRect(tl.X + (bw2 - mw) / 2, tl.Y - bh * 0.1, mw, bh * 1.2);
          ctx.fillStyle = '#fff'; ctx.font = `900 ${bh * 0.7}px ${font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(t('ФИНИШ'), tl.X + bw2 / 2, tl.Y + bh * 0.52);
        }
      } });
    };

    const drawHud = (tt: number) => {
      const [mr, rr2] = runs;
      // прогресс обеих машин
      const bx = 14, bw = W - 28, by = 12;
      ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(bx, by - 1.5, bw, 3);
      for (const [r, col] of [[rr2, '#e8eaee'], [mr, '#ff7a1a']] as [Run, string][]) {
        const p = Math.min(1, r.s / th.L);
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(bx + p * bw, by, 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1.5; ctx.stroke();
      }
      ctx.font = `14px ${font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🏁', bx + bw, by - 1);
      // светофор
      if (tt < COUNT + 0.9) {
        const lit = Math.floor((tt / COUNT) * 4);
        const cx = W / 2, cy = 40, a = tt > COUNT ? Math.max(0, 1 - (tt - COUNT) / 0.9) : 1;
        ctx.globalAlpha = a;
        ctx.fillStyle = 'rgba(8,9,12,.85)'; ctx.beginPath(); (ctx as any).roundRect ? (ctx as any).roundRect(cx - 52, cy - 15, 104, 30, 15) : ctx.rect(cx - 52, cy - 15, 104, 30); ctx.fill();
        for (let i = 0; i < 3; i++) {
          const go = tt >= COUNT, on = go || lit > i;
          ctx.fillStyle = go ? '#3ccf7a' : on ? '#ff4d4d' : '#2a2f3a';
          ctx.save(); if (on) { ctx.shadowColor = ctx.fillStyle as string; ctx.shadowBlur = 14; }
          ctx.beginPath(); ctx.arc(cx - 30 + i * 30, cy, 9, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
        if (tt >= COUNT) {
          ctx.fillStyle = '#3ccf7a'; ctx.font = `900 ${30 + (tt - COUNT) * 20}px ${font}`; ctx.textAlign = 'center';
          ctx.fillText(t('СТАРТ!'), cx, H * 0.36);
        }
        ctx.globalAlpha = 1;
      }
      // место и отрыв
      const gap = mr.s - rr2.s, lead = gap >= 0;
      if (tt > COUNT) {
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.font = `900 30px ${font}`; ctx.fillStyle = lead ? '#ffd23c' : '#ffffff';
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 6;
        ctx.fillText(lead ? '1' : '2', 14, H - 30);
        ctx.font = `800 13px ${font}`; ctx.fillText('/2', 34, H - 30);
        ctx.font = `700 12px ${font}`; ctx.fillStyle = lead ? '#7df0a8' : '#ff8d8d';
        ctx.fillText(`${lead ? '+' : '−'}${Math.abs(gap).toFixed(gap > -10 && gap < 10 ? 1 : 0).replace('.', ',')} ${t('м')}`, 14, H - 13);
        ctx.restore();
      }
      // спидометр
      const R = 40, sx = W - R - 12, sy = H - R - 10, a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
      const top = Math.ceil(((me.max_speed || 220) * 1.05) / 20) * 20;
      ctx.fillStyle = 'rgba(8,9,12,.78)'; ctx.beginPath(); ctx.arc(sx, sy, R + 4, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.arc(sx, sy, R - 3, a0, a1); ctx.stroke();
      ctx.strokeStyle = '#ff4d4d'; ctx.beginPath(); ctx.arc(sx, sy, R - 3, a0 + (a1 - a0) * 0.85, a1); ctx.stroke();
      const frac = Math.min(1, mr.kmh / top);
      ctx.strokeStyle = '#ff7a1a'; ctx.beginPath(); ctx.arc(sx, sy, R - 3, a0, a0 + (a1 - a0) * frac); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.2;
      for (let i = 0; i <= 10; i++) { const an = a0 + ((a1 - a0) * i) / 10; ctx.beginPath(); ctx.moveTo(sx + Math.cos(an) * (R - 9), sy + Math.sin(an) * (R - 9)); ctx.lineTo(sx + Math.cos(an) * (R - 13), sy + Math.sin(an) * (R - 13)); ctx.stroke(); }
      const na = a0 + (a1 - a0) * frac + (tt < COUNT ? Math.sin(tt * 30) * 0.02 : 0);
      ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(na) * (R - 8), sy + Math.sin(na) * (R - 8)); ctx.stroke();
      ctx.fillStyle = '#ff3b3b'; ctx.beginPath(); ctx.arc(sx, sy, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `900 15px ${font}`; ctx.fillText(String(Math.round(mr.kmh)), sx, sy + 17);
      ctx.font = `700 8px ${font}`; ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillText(t('км/ч'), sx, sy + 28);
      ctx.font = `900 11px ${font}`; ctx.fillStyle = '#ffd23c'; ctx.fillText(mr.gear ? String(mr.gear) : 'N', sx, sy - 15);
      // финиш
      if (finishAt >= 0) {
        const k = Math.min(1, (tt - finishAt) / 0.25);
        ctx.save(); ctx.globalAlpha = k; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 10;
        ctx.font = `900 ${26 + (1 - k) * 18}px ${font}`; ctx.fillStyle = '#fff';
        ctx.fillText(photo ? t('ФОТОФИНИШ!') : t('ФИНИШ!'), W / 2, H * 0.34);
        ctx.restore();
      }
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      time = skipRef.current ? tEnd : time + dt;
      const tt = time;
      runs.forEach((r, i) => { step(r, cars[i], tt); r.flame = Math.max(0, r.flame - dt * 4); });
      const [mr, rr2] = runs;
      // светофор: звук
      const lit = tt >= COUNT ? 4 : Math.floor((tt / COUNT) * 4);
      if (lit > lastLight && !skipRef.current) { if (lit < 4) fx.tick(); else { fx.engine(); } lastLight = lit; }
      if (finishAt < 0 && mr.s >= th.L) { finishAt = tt; if (!skipRef.current) fx.tick(); }
      // камера едет за своей машиной; если соперник чуть позади — отъезжает, чтобы его было видно
      camS = Math.max(mr.s - 13, Math.min(mr.s - 7, rr2.s - 4.5));
      const speedK = Math.min(1, mr.kmh / ((me.max_speed || 220) * 0.94));
      shake = tt > COUNT && tt < COUNT + 0.5 ? 2.2 : speedK * 0.9;
      // двигатель
      if (eng) {
        const within = mr.gear ? (mr.kmh / ((me.max_speed || 220) * 0.94)) * 6.2 - (mr.gear - 1) : 0;
        eng.set(tt < COUNT ? 0.3 + 0.45 * Math.abs(Math.sin(tt * 5)) : mr.done ? Math.max(0.1, speedK * 0.6) : 0.25 + 0.75 * Math.min(1, Math.max(0, within)));
      }
      // дым и пыль
      runs.forEach((r, i) => {
        const burn = tt < COUNT ? 0.35 : tt < COUNT + 1.1 ? 1 : 0;
        const n = th.dust ? (r.v > 5 ? 1 : burn && Math.random() < 0.5 ? 1 : 0) : burn ? (Math.random() < (tt < COUNT ? 0.35 : 0.8) ? 1 : 0) : 0;
        for (let k = 0; k < n; k++) {
          if (smoke.length > 260) break;
          const side = k % 2 ? 1 : -1;
          smoke.push({ s: r.s - 0.4 - Math.random() * 0.6, x: lanes[i] + side * 0.75 + (Math.random() - 0.5) * 0.3, y: 0.15, r: 0.18 + Math.random() * 0.15,
            born: tt, life: th.dust ? 1.4 : 1.1 + Math.random() * 0.6, vx: side * (0.6 + Math.random() * 1.2), dust: !!th.dust });
        }
      });
      smoke = smoke.filter((p) => tt - p.born < p.life && p.s - camS > 2.5);

      // кадр
      ctx.save();
      ctx.clearRect(0, 0, W, H);
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      drawSky();
      drawRoad();
      const items: { z: number; draw: () => void }[] = [];
      drawProps(items);
      for (const p of smoke) {
        const age = (tt - p.born) / p.life;
        items.push({ z: p.s - camS, draw: () => {
          const q = proj(p.s, p.x + p.vx * age, p.y + age * 1.2);
          const rad = Math.min(W * 0.12, (p.r + age * 0.85) * q.sc);
          const near = Math.min(1, (q.z - 2.5) / 3);
          ctx.fillStyle = p.dust ? `rgba(196,160,118,${0.3 * (1 - age) * near})` : `rgba(215,218,224,${0.32 * (1 - age) * near})`;
          ctx.beginPath(); ctx.arc(q.X, q.Y, rad, 0, Math.PI * 2); ctx.fill();
        } });
      }
      runs.forEach((r, i) => {
        const z = r.s - camS;
        if (z < 1.6) return;
        items.push({ z, draw: () => {
          const p = proj(r.s, lanes[i]);
          const bounce = tt > COUNT ? Math.sin(tt * 40 + i) * 0.4 * Math.min(1, r.v / 30) : Math.abs(Math.sin(tt * 18 + i)) * 0.8;
          drawCar(p.X, p.Y - bounce, 1.9 * p.sc, cars[i], r, i === 0, i === 0 ? t('Ты') : rivalName);
        } });
      });
      items.sort((a, b) => b.z - a.z).forEach((it) => it.draw());
      // полосы скорости
      if (speedK > 0.45 && !mr.done) {
        ctx.strokeStyle = `rgba(255,255,255,${(speedK - 0.45) * 0.5})`; ctx.lineWidth = 1.2;
        for (let i = 0; i < 14; i++) {
          const an = rnd(i + Math.floor(tt * 12) * 31) * Math.PI * 2, r0 = W * (0.45 + rnd(i * 3 + Math.floor(tt * 12)) * 0.2);
          const x0 = W / 2 + Math.cos(an) * r0, y0 = HOR + Math.sin(an) * r0 * 0.7;
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + Math.cos(an) * 40 * speedK, y0 + Math.sin(an) * 28 * speedK); ctx.stroke();
        }
      }
      ctx.restore();
      drawHud(tt);

      if (tt >= tEnd && !ended) { ended = true; eng?.stop(); endRef.current(); }
      if (!ended || tt < tEnd + 2.5) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); eng?.stop(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <canvas ref={ref} className="race-scene" onClick={() => { skipRef.current = true; }} />;
}
