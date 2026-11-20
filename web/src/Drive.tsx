// Drive.tsx — заезд, которым игрок управляет сам (вид из-за машины, псевдо-3D на canvas).
// Физика — src/drive.js (тот же файл, что на сервере): шаг 1/60 с, нажатия записываются
// и после финиша уходят на сервер, который пересчитывает заезд и сам определяет время.
// Соперник — «призрак»: бот (тот же ИИ, что на сервере) или запись заезда другого игрока.
// replay — повтор из истории: обе машины по записанным нажатиям, без кнопок.
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Flame, X } from 'lucide-react';
import * as D from './drive.js';
import { engineLoop, fx } from './sound';
import { t } from './i18n';

export type DCar = { name?: string; color?: string; body?: string; rarity?: string; max_speed?: number; accel_x100?: number; power?: number; handling?: number; reliability?: number };
export type Side = { car: DCar; reaction: number; inputs?: number[][]; ai?: number; label: string };
type Props = {
  track: string; seed: number; me: Side; rival: Side | null; live: boolean;
  onFinish?: (inputs: number[][], ms: number) => void; onExit?: () => void; overlay?: React.ReactNode;
};

type Theme = { sky: string[]; haze: string; grass: [string, string]; road: [string, string]; rumble: [string, string]; line: string | null; night?: boolean; dust?: boolean; scenery: 'city' | 'stands' | 'hills' };
const THEME: Record<string, Theme> = {
  drag: { sky: ['#07061a', '#24103f', '#7a2a55', '#ff8a3d'], haze: '#5a2448', grass: ['#101218', '#13161d'], road: ['#24272e', '#282b33'], rumble: ['#e9e9ec', '#d23b3b'], line: '#f4f4f4', night: true, scenery: 'city' },
  circuit: { sky: ['#1f6fd0', '#5aa6ec', '#a9d6f7', '#e4f3fd'], haze: '#cfe6f6', grass: ['#3c8c37', '#44973e'], road: ['#4a4d55', '#4f525a'], rumble: ['#f3f3f3', '#d6262b'], line: '#ffffff', scenery: 'stands' },
  rally: { sky: ['#2c2350', '#7a4a78', '#e0785a', '#ffcf86'], haze: '#e6a777', grass: ['#5f7234', '#677b39'], road: ['#93714c', '#9b7852'], rumble: ['#7a5c3c', '#846448'], line: null, dust: true, scenery: 'hills' },
};
const BODY: Record<string, { h: number; cab: number; top: number; wing?: boolean; bar?: boolean }> = {
  hatch: { h: 0.44, cab: 0.3, top: 0.66 }, sedan: { h: 0.42, cab: 0.28, top: 0.62 }, wagon: { h: 0.43, cab: 0.3, top: 0.7 },
  suv: { h: 0.54, cab: 0.32, top: 0.7 }, van: { h: 0.58, cab: 0.36, top: 0.8 }, coupe: { h: 0.37, cab: 0.24, top: 0.56, bar: true },
  roadster: { h: 0.36, cab: 0.16, top: 0.5, bar: true }, super: { h: 0.31, cab: 0.19, top: 0.52, wing: true, bar: true },
};
const TRAFFIC = ['#e8e8ea', '#2f6fd8', '#d6262b', '#f2c230', '#1d2733', '#4f8f6a', '#9aa3ad', '#7a1218', '#e57a1f'];
const SEG = 2, Z_FAR = 300, CAM_D = 4.6, CAM_H = 2.1;
const MSG: Record<string, [string, string]> = {
  perfect: ['ИДЕАЛЬНО!', '#3ccf7a'], good: ['Хорошо', '#ffffff'], early: ['Рано', '#ffb03c'], late: ['Поздно', '#ff6b6b'],
  lperfect: ['ИДЕАЛЬНЫЙ СТАРТ!', '#3ccf7a'], lspin: ['Пробуксовка!', '#ff6b6b'], lbog: ['Мало оборотов', '#ffb03c'], lgood: ['Старт!', '#ffffff'],
  hit: ['УДАР!', '#ff6b6b'], near: ['ОБГОН! +нитро', '#5fd0ff'], off: ['Вылет с трассы', '#ffb03c'], finish: ['ФИНИШ!', '#ffffff'],
};

function rgb(hex: string | undefined): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  const n = m ? parseInt(m[1], 16) : 0x8a96a3;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shade(c: [number, number, number], k: number, a = 1) {
  const f = (v: number) => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k));
  return `rgba(${f(c[0])},${f(c[1])},${f(c[2])},${a})`;
}
const rnd = (i: number) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const md = (a: number, n: number) => ((a % n) + n) % n;
export const fmtMs = (ms: number) => { const s = ms / 1000; const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0').replace('.', ',')}`; };

export function Drive({ track, seed, me, rival, live, onFinish, onExit, overlay }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const keys = useRef({ L: 0, R: 0, BRAKE: 0, NITRO: 0, PEDAL: 0, pedalFresh: false });
  const finishRef = useRef(onFinish); finishRef.current = onFinish;
  const [launched, setLaunched] = useState(false);
  const [done, setDone] = useState(false);
  const manual = track === 'drag';

  useEffect(() => {
    const cv = ref.current!;
    let W = 0, H = 0;
    const ctx = cv.getContext('2d')!;
    const resize = () => {
      W = cv.clientWidth; H = cv.clientHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    const font = getComputedStyle(document.body).fontFamily || 'sans-serif';
    const th = THEME[track] ?? THEME.drag;
    const tr = D.buildTrack(track, seed);
    const cpMe = D.carParams(me.car, track, me.reaction);
    const sMe: any = D.newState(tr, -D.LANE);
    const cpR = rival ? D.carParams(rival.car, track, rival.reaction) : null;
    const sR: any = rival ? D.newState(tr, rival.ai != null ? D.LANE : -D.LANE) : null;
    const ai = rival?.ai != null ? D.aiDriver(seed, rival.ai) : null;
    const rec: number[][] = [];
    let lastMask = -1, iMe = 0, maskMe = 0, iR = 0, maskR = 0, sent = false, raf = 0, last = performance.now(), acc = 0;
    let heading = 0, msg: { k: string; at: number } | null = null, lastShift: any = null, lastLights = 0;
    const smoke: { s: number; x: number; born: number; dust: boolean; r: number; vx: number }[] = [];
    const eng = engineLoop();
    const say = (k: string) => { msg = { k, at: performance.now() }; };

    const maskLive = () => {
      const k = keys.current;
      let m = 0;
      if (k.L) m |= D.B.L; if (k.R) m |= D.B.R; if (k.BRAKE) m |= D.B.BRAKE; if (k.NITRO) m |= D.B.NITRO;
      if (manual) { if (!sMe.launched) { if (k.PEDAL) m |= D.B.GAS; } else if (k.PEDAL && k.pedalFresh) m |= D.B.SHIFT; }
      return m;
    };
    const tickOnce = () => {
      let m: number;
      if (live) {
        m = maskLive();
        if (!sMe.finished && m !== lastMask) { rec.push([sMe.tick + 1, m]); lastMask = m; }
      } else {
        const inp = me.inputs ?? [];
        while (iMe < inp.length && inp[iMe][0] <= sMe.tick + 1) maskMe = inp[iMe++][1];
        m = maskMe;
      }
      const wasLaunched = sMe.launched, wasOff = sMe.off;
      D.step(tr, cpMe, sMe, m);
      if (!wasLaunched && sMe.launched) { setLaunched(true); say(manual ? 'l' + (sMe.launch ?? 'good') : 'lgood'); }
      if (sMe.shift && sMe.shift !== lastShift) { lastShift = sMe.shift; say(sMe.shift.q); if (sMe.shift.q === 'perfect') fx.tick(); }
      if (sMe.hit >= 0) { say('hit'); fx.error(); }
      if (sMe.near >= 0) say('near');
      if (!wasOff && sMe.off) say('off');
      if (sR && cpR) {
        let mr = 0;
        if (ai) mr = D.aiMask(tr, cpR, sR, ai);
        else { const inp = rival!.inputs ?? []; while (iR < inp.length && inp[iR][0] <= sR.tick + 1) maskR = inp[iR++][1]; mr = maskR; }
        D.step(tr, cpR, sR, mr);
      }
      heading += D.curveAt(tr, sMe.s) * sMe.v / D.TICK;
      // дым на старте и пыль
      for (const [st, x0] of [[sMe, 0], ...(sR ? [[sR, 1]] : [])] as [any, number][]) {
        const burn = st.launched && st.v < 14 && (st.spin > 0 || st.v < 6);
        const n = th.dust ? (st.v > 6 ? 1 : 0) : burn ? 1 : 0;
        if (n && smoke.length < 160 && Math.random() < 0.7) {
          const side = Math.random() < 0.5 ? -1 : 1;
          smoke.push({ s: st.s - 0.6, x: st.x + side * 0.75, born: performance.now(), dust: !!th.dust, r: 0.25 + Math.random() * 0.2, vx: side * (0.4 + Math.random()) });
        }
        void x0;
      }
      if (sMe.finished && !sent) {
        sent = true; say('finish'); setDone(true);
        if (live) finishRef.current?.(rec, sMe.ms); else finishRef.current?.([], sMe.ms);
      }
    };

    // ---------- рисование ----------
    const poly = (pts: number[], fill: string | CanvasGradient) => {
      ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      ctx.closePath(); ctx.fill();
    };
    const rrect = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath(); (ctx as any).roundRect ? (ctx as any).roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
    };

    const drawCar = (cx: number, gy: number, w: number, car: DCar, st: any, label: string, mine: boolean, alpha = 1, steer = 0) => {
      const c = rgb(car.color);
      const b = BODY[car.body ?? ''] ?? BODY.sedan;
      ctx.save(); ctx.globalAlpha = alpha;
      ctx.translate(cx, gy); ctx.rotate(steer * 0.035); ctx.translate(-cx, -gy);
      const X = (x: number) => cx + x * w, Y = (y: number) => gy - y * w;
      const box = (x1: number, y1: number, x2: number, y2: number, rad: number, fill: string | CanvasGradient) => { ctx.fillStyle = fill; rrect(X(x1), Y(y2), (x2 - x1) * w, (y2 - y1) * w, rad * w); ctx.fill(); };
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.ellipse(cx, gy, w * 0.62, w * 0.07, 0, 0, Math.PI * 2); ctx.fill();
      box(-0.5, 0, -0.35, 0.23, 0.04, '#0c0d10'); box(0.35, 0, 0.5, 0.23, 0.04, '#0c0d10');
      const gr = ctx.createLinearGradient(0, Y(b.h), 0, Y(0.1));
      gr.addColorStop(0, shade(c, 0.28)); gr.addColorStop(0.35, shade(c, 0)); gr.addColorStop(1, shade(c, -0.45));
      ctx.fillStyle = gr; ctx.beginPath();
      ctx.moveTo(X(-0.5), Y(0.12)); ctx.lineTo(X(-0.505), Y(b.h * 0.7)); ctx.quadraticCurveTo(X(-0.5), Y(b.h), X(-0.44), Y(b.h));
      ctx.lineTo(X(0.44), Y(b.h)); ctx.quadraticCurveTo(X(0.5), Y(b.h), X(0.505), Y(b.h * 0.7)); ctx.lineTo(X(0.5), Y(0.12));
      ctx.quadraticCurveTo(X(0.5), Y(0.09), X(0.46), Y(0.09)); ctx.lineTo(X(-0.46), Y(0.09)); ctx.quadraticCurveTo(X(-0.5), Y(0.09), X(-0.5), Y(0.12));
      ctx.fill();
      const tw = b.top / 2, bw = 0.43;
      const cg = ctx.createLinearGradient(0, Y(b.h + b.cab), 0, Y(b.h));
      cg.addColorStop(0, shade(c, 0.35)); cg.addColorStop(1, shade(c, -0.1));
      poly([X(-bw), Y(b.h - 0.005), X(bw), Y(b.h - 0.005), X(tw), Y(b.h + b.cab), X(-tw), Y(b.h + b.cab)], cg);
      const glass = ctx.createLinearGradient(0, Y(b.h + b.cab), 0, Y(b.h));
      glass.addColorStop(0, th.night ? '#1b2434' : '#4b5c70'); glass.addColorStop(1, '#0d1118');
      poly([X(-bw + 0.06), Y(b.h + 0.025), X(bw - 0.06), Y(b.h + 0.025), X(tw - 0.045), Y(b.h + b.cab - 0.035), X(-tw + 0.045), Y(b.h + b.cab - 0.035)], glass);
      box(-0.56, b.h + 0.02, -0.47, b.h + 0.07, 0.015, shade(c, -0.15)); box(0.47, b.h + 0.02, 0.56, b.h + 0.07, 0.015, shade(c, -0.15));
      box(-0.11, 0.2, 0.11, 0.29, 0.015, shade(c, -0.5));
      box(-0.44, 0.09, 0.44, 0.17, 0.03, '#15171b');
      const ex = b.wing ? [-0.07, 0.07] : [-0.3, 0.3];
      for (const x of ex) { ctx.fillStyle = '#6b6f78'; ctx.beginPath(); ctx.ellipse(X(x), Y(0.13), w * 0.04, w * 0.026, 0, 0, Math.PI * 2); ctx.fill(); }
      const braking = st && (st.a < -3);
      ctx.save(); ctx.shadowColor = '#ff2a2a'; ctx.shadowBlur = w * (braking ? 0.5 : th.night ? 0.3 : 0.12);
      const ly = b.h - 0.08, lh = braking ? 0.07 : 0.055;
      const lg = ctx.createLinearGradient(0, Y(ly + lh / 2), 0, Y(ly - lh / 2));
      lg.addColorStop(0, braking ? '#ffb0b0' : '#ff6b6b'); lg.addColorStop(1, '#b3121b');
      box(-0.48, ly - lh / 2, -0.25, ly + lh / 2, 0.012, lg); box(0.25, ly - lh / 2, 0.48, ly + lh / 2, 0.012, lg);
      if (b.bar) box(-0.25, ly - 0.01, 0.25, ly + 0.01, 0.005, '#e22a2a');
      ctx.restore();
      if (b.wing) { box(-0.27, b.h - 0.02, -0.23, b.h + 0.07, 0, '#16181c'); box(0.23, b.h - 0.02, 0.27, b.h + 0.07, 0, '#16181c'); box(-0.5, b.h + 0.07, 0.5, b.h + 0.11, 0.01, '#1c1e23'); }
      // нитро — пламя из выхлопа
      if (st?.nitroOn || (st?.shift && st.tick - st.shift.tick < 8)) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (const x of ex) {
          const fr = w * (st.nitroOn ? 0.16 + Math.random() * 0.05 : 0.1);
          const fg = ctx.createRadialGradient(X(x), Y(0.13), 0, X(x), Y(0.13), fr);
          fg.addColorStop(0, 'rgba(255,255,240,1)'); fg.addColorStop(0.3, st.nitroOn ? 'rgba(90,170,255,.95)' : 'rgba(255,150,40,.9)'); fg.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = fg; ctx.fillRect(X(x) - fr, Y(0.13) - fr, fr * 2, fr * 2);
        }
        ctx.restore();
      }
      if (label && w > 24) {
        ctx.font = `800 ${Math.max(10, Math.min(13, w * 0.12))}px ${font}`;
        const lw = ctx.measureText(label).width + 12, ty = Y(b.h + b.cab + 0.1) - 16;
        ctx.fillStyle = mine ? 'rgba(255,122,26,.92)' : 'rgba(20,22,28,.8)'; rrect(cx - lw / 2, ty, lw, 17, 8); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, cx, ty + 9);
      }
      ctx.restore();
    };

    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      acc += dt;
      let n = 0;
      while (acc >= 1 / D.TICK && n < 6) { tickOnce(); acc -= 1 / D.TICK; n++; }
      if (n === 6) acc = 0;
      // светофор: звук
      const toGreen = tr.green - sMe.tick;
      const lights = toGreen <= 0 ? 4 : toGreen <= 30 ? 3 : toGreen <= 60 ? 2 : toGreen <= 90 ? 1 : 0;
      if (lights > lastLights) { lights < 4 ? fx.tick() : fx.engine(); lastLights = lights; }

      const camS = sMe.s - CAM_D, camX = sMe.x * 0.75;
      const F = Math.min(W * 1.15, H * 0.6), HOR = Math.round(H * 0.4);
      // центр дороги по дистанции (накопленная кривизна)
      const N = Math.ceil(Z_FAR / SEG) + 2;
      const cx = new Float64Array(N + 1);
      { let x = 0, dx = 0; for (let j = 0; j <= N; j++) { cx[j] = x; dx += D.curveAt(tr, camS + j * SEG) * SEG; x += dx * SEG; } }
      const centerAt = (z: number) => { const f = z / SEG; const j = Math.max(0, Math.min(N - 1, Math.floor(f))); const u = f - j; return cx[j] * (1 - u) + cx[j + 1] * u; };
      const proj = (s: number, x: number, y = 0) => {
        const z = s - camS, sc = F / z;
        return { X: W / 2 + (centerAt(z) + x - camX) * sc, Y: HOR + (CAM_H - y) * sc, sc, z };
      };

      ctx.save();
      const shake = sMe.hit >= 0 ? 6 : sMe.off ? 1.5 : sMe.nitroOn ? 1.2 : 0;
      ctx.clearRect(0, 0, W, H);
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      // небо и горизонт
      const sky = ctx.createLinearGradient(0, 0, 0, HOR);
      th.sky.forEach((c, i) => sky.addColorStop(i / (th.sky.length - 1), c));
      ctx.fillStyle = sky; ctx.fillRect(-10, -10, W + 20, HOR + 11);
      const shift = md(-heading * F * 0.6, W);
      for (let rep = -1; rep <= 1; rep++) {
        const ox = rep * W + shift;
        if (th.scenery === 'city') {
          for (let i = 0; i < 24; i++) {
            const bw = W / 24 + rnd(i) * 10, bh = 10 + rnd(i + 50) * HOR * 0.45, bx = ox + i * (W / 24);
            ctx.fillStyle = '#0c0a1a'; ctx.fillRect(bx, HOR - bh, bw, bh);
            ctx.fillStyle = 'rgba(255,210,120,.55)';
            for (let w = 0; w < 6; w++) if (rnd(i * 7 + w) > 0.55) ctx.fillRect(bx + 2 + rnd(i * 3 + w) * (bw - 5), HOR - bh + 3 + rnd(i * 11 + w) * (bh - 6), 1.5, 1.5);
          }
        } else if (th.scenery === 'stands') {
          ctx.fillStyle = '#6f9e5c'; ctx.beginPath(); ctx.moveTo(ox, HOR);
          for (let i = 0; i <= 12; i++) ctx.lineTo(ox + (i * W) / 12, HOR - 8 - rnd(i + 3) * 18);
          ctx.lineTo(ox + W, HOR); ctx.fill();
          ctx.fillStyle = '#d7dde4'; ctx.fillRect(ox + W * 0.55, HOR - 22, W * 0.32, 22);
          ctx.fillStyle = '#3d4a5c'; ctx.fillRect(ox + W * 0.55, HOR - 26, W * 0.32, 5);
          for (let i = 0; i < 40; i++) { ctx.fillStyle = ['#e64545', '#3b7ddd', '#f2c230', '#ffffff'][i % 4]; ctx.fillRect(ox + W * 0.56 + rnd(i) * W * 0.3, HOR - 19 + rnd(i + 9) * 16, 2, 2); }
        } else {
          ctx.fillStyle = '#5b3d63'; ctx.beginPath(); ctx.moveTo(ox, HOR);
          for (let i = 0; i <= 8; i++) ctx.lineTo(ox + (i * W) / 8, HOR - 20 - rnd(i + 21) * HOR * 0.45);
          ctx.lineTo(ox + W, HOR); ctx.fill();
          ctx.fillStyle = '#3f3150'; ctx.beginPath(); ctx.moveTo(ox, HOR);
          for (let i = 0; i <= 14; i++) ctx.lineTo(ox + (i * W) / 14, HOR - 6 - rnd(i + 70) * 20);
          ctx.lineTo(ox + W, HOR); ctx.fill();
        }
      }
      // дорога: от дальних отрезков к ближним
      for (let j = N - 2; j >= 0; j--) {
        const z1 = Math.max(0.6, j * SEG), z2 = (j + 1) * SEG;
        const s1 = camS + z1, s2 = camS + z2;
        const a = proj(s1, 0), b = proj(s2, 0);
        const wi = Math.floor((camS + j * SEG) / SEG);
        const wA = D.HALF * a.sc, wB = D.HALF * b.sc;
        ctx.fillStyle = th.grass[md(Math.floor(wi / 3), 2)]; ctx.fillRect(-10, b.Y, W + 20, a.Y - b.Y + 1);
        poly([a.X - wA * 1.13, a.Y, a.X + wA * 1.13, a.Y, b.X + wB * 1.13, b.Y, b.X - wB * 1.13, b.Y], th.rumble[md(wi, 2)]);
        poly([a.X - wA, a.Y, a.X + wA, a.Y, b.X + wB, b.Y, b.X - wB, b.Y], th.road[md(Math.floor(wi / 2), 2)]);
        if (th.line) {
          if (md(wi, 4) < 2) poly([a.X - 0.07 * a.sc, a.Y, a.X + 0.07 * a.sc, a.Y, b.X + 0.07 * b.sc, b.Y, b.X - 0.07 * b.sc, b.Y], th.line);
          for (const sd of [-1, 1]) poly([a.X + sd * wA * 0.93, a.Y, a.X + sd * wA * 0.9, a.Y, b.X + sd * wB * 0.9, b.Y, b.X + sd * wB * 0.93, b.Y], 'rgba(255,255,255,.75)');
        }
        // старт и финиш
        for (const [line, rows] of [[0, 1], [tr.L, 3]] as [number, number][]) {
          if (line + rows * 0.9 > s1 && line < s2) {
            const cells = line ? 14 : 1;
            for (let r = 0; r < rows; r++) for (let i = 0; i < cells; i++) {
              const sa = line + r * 0.9, sb = sa + 0.9;
              if (sa - camS < 0.8) continue;
              const xa = -D.HALF + (i * 2 * D.HALF) / cells, xb = -D.HALF + ((i + 1) * 2 * D.HALF) / cells;
              const p1 = proj(sa, xa), p2 = proj(sa, xb), p3 = proj(sb, xb), p4 = proj(sb, xa);
              poly([p1.X, p1.Y, p2.X, p2.Y, p3.X, p3.Y, p4.X, p4.Y], line ? ((i + r) % 2 ? '#111' : '#f4f4f4') : 'rgba(255,255,255,.85)');
            }
          }
        }
      }
      const hz = ctx.createLinearGradient(0, HOR - 14, 0, HOR + 30);
      hz.addColorStop(0, shade(rgb(th.haze), 0, 0)); hz.addColorStop(0.35, shade(rgb(th.haze), 0, th.night ? 0.55 : 0.75)); hz.addColorStop(1, shade(rgb(th.haze), 0, 0));
      ctx.fillStyle = hz; ctx.fillRect(-10, HOR - 14, W + 20, 44);

      // объекты по глубине
      const items: { z: number; draw: () => void }[] = [];
      const sFrom = Math.ceil((camS + 1) / 24) * 24;
      for (let s = sFrom; s < camS + Z_FAR * 0.85; s += 24) {
        for (const side of [-1, 1]) {
          const k = Math.round(s / 24) * 2 + (side > 0 ? 1 : 0);
          items.push({ z: s - camS, draw: () => {
            if (th.scenery === 'hills') {
              const x = side * (D.HALF + 2.5 + rnd(k) * 6), hgt = 5 + rnd(k + 3) * 4;
              const p = proj(s, x), top = proj(s, x, hgt), h = p.Y - top.Y;
              ctx.fillStyle = '#3b2a1e'; ctx.fillRect(p.X - 0.15 * p.sc, top.Y + h * 0.6, 0.3 * p.sc, h * 0.4);
              poly([p.X, top.Y, p.X + 1.6 * p.sc, top.Y + h * 0.55, p.X - 1.6 * p.sc, top.Y + h * 0.55], '#38592d');
              poly([p.X, top.Y + h * 0.25, p.X + 1.9 * p.sc, top.Y + h * 0.82, p.X - 1.9 * p.sc, top.Y + h * 0.82], '#2e4a26');
            } else {
              const x = side * (D.HALF + 1.1), p = proj(s, x), top = proj(s, x, 6.5), arm = proj(s, x - side * 1.4, 6.5);
              ctx.fillStyle = th.night ? '#2b2f38' : '#8b939e';
              ctx.fillRect(p.X - Math.max(0.6, 0.08 * p.sc), top.Y, Math.max(1.2, 0.16 * p.sc), p.Y - top.Y);
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
      // стрелки на внешней стороне поворота
      for (let s = Math.ceil((camS + 2) / 10) * 10; s < camS + 140; s += 10) {
        const k = D.curveAt(tr, s);
        if (Math.abs(k) < 1 / 140) continue;
        const side = k > 0 ? -1 : 1;
        items.push({ z: s - camS, draw: () => {
          const a = proj(s, side * (D.HALF + 0.9), 1.6), b = proj(s, side * (D.HALF + 0.9) + side * 0.01, 0.6);
          const w2 = 0.55 * a.sc;
          ctx.fillStyle = '#d6262b'; ctx.fillRect(a.X - w2, a.Y, w2 * 2, b.Y - a.Y);
          ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, 0.12 * a.sc); ctx.beginPath();
          const dir = -side;
          ctx.moveTo(a.X - dir * w2 * 0.45, a.Y + (b.Y - a.Y) * 0.15); ctx.lineTo(a.X + dir * w2 * 0.35, a.Y + (b.Y - a.Y) * 0.5); ctx.lineTo(a.X - dir * w2 * 0.45, a.Y + (b.Y - a.Y) * 0.85); ctx.stroke();
        } });
      }
      // таблички «осталось»
      for (const left of [300, 200, 100]) {
        const s = tr.L - left;
        if (s - camS < 2 || s - camS > Z_FAR * 0.7 || s < 20) continue;
        for (const side of [-1, 1]) items.push({ z: s - camS, draw: () => {
          const x = side * (D.HALF + 2.2), a = proj(s, x - 0.9, 2.6), b = proj(s, x + 0.9, 1.4), leg = proj(s, x);
          ctx.fillStyle = '#2a2d34'; ctx.fillRect(leg.X - 0.05 * leg.sc, b.Y, Math.max(1, 0.1 * leg.sc), leg.Y - b.Y);
          ctx.fillStyle = '#f4f4f4'; ctx.fillRect(a.X, a.Y, b.X - a.X, b.Y - a.Y);
          if (b.X - a.X > 14) { ctx.fillStyle = '#111'; ctx.font = `900 ${(b.Y - a.Y) * 0.6}px ${font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(left), (a.X + b.X) / 2, (a.Y + b.Y) / 2); }
        } });
      }
      // финишная арка
      const fz = tr.L - camS;
      if (fz > 1 && fz < Z_FAR) items.push({ z: fz, draw: () => {
        const xl = -D.HALF - 0.7, xr = D.HALF + 0.7;
        const pl = proj(tr.L, xl), pr = proj(tr.L, xr), tl = proj(tr.L, xl, 5.6), br = proj(tr.L, xr, 4.3);
        const pw = Math.max(1.5, 0.3 * pl.sc);
        ctx.fillStyle = '#d9dde3'; ctx.fillRect(pl.X - pw / 2, tl.Y, pw, pl.Y - tl.Y); ctx.fillRect(pr.X - pw / 2, tl.Y, pw, pr.Y - tl.Y);
        const bw2 = br.X - tl.X, bh = br.Y - tl.Y, n2 = 20;
        for (let row = 0; row < 2; row++) for (let i = 0; i < n2; i++) { ctx.fillStyle = (i + row) % 2 ? '#111' : '#f4f4f4'; ctx.fillRect(tl.X + (i * bw2) / n2, tl.Y + (row * bh) / 2, bw2 / n2 + 0.5, bh / 2 + 0.5); }
        if (bw2 > 60) {
          const mw = bw2 * 0.42;
          ctx.fillStyle = '#d23b3b'; ctx.fillRect(tl.X + (bw2 - mw) / 2, tl.Y - bh * 0.1, mw, bh * 1.2);
          ctx.fillStyle = '#fff'; ctx.font = `900 ${bh * 0.7}px ${font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t('ФИНИШ'), tl.X + bw2 / 2, tl.Y + bh * 0.52);
        }
      } });
      // препятствия
      tr.obs.forEach((o: any, i: number) => {
        const s = D.obsAt(tr, o, sMe.tick), z = s - camS;
        if (z < 1.2 || z > Z_FAR * 0.8) return;
        items.push({ z, draw: () => {
          const p = proj(s, o.x);
          if (o.kind === 'car') drawCar(p.X, p.Y, 1.9 * p.sc, { color: TRAFFIC[i % TRAFFIC.length], body: ['sedan', 'hatch', 'suv', 'van'][i % 4] }, null, '', false);
          else {
            const r = 0.55 * p.sc;
            ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(p.X, p.Y, r * 1.2, r * 0.25, 0, 0, Math.PI * 2); ctx.fill();
            poly([p.X - r, p.Y, p.X - r * 0.7, p.Y - r * 0.9, p.X + r * 0.1, p.Y - r * 1.2, p.X + r * 0.9, p.Y - r * 0.6, p.X + r, p.Y], '#7d7a75');
            poly([p.X - r * 0.6, p.Y - r * 0.8, p.X + r * 0.1, p.Y - r * 1.15, p.X + r * 0.5, p.Y - r * 0.75, p.X - r * 0.1, p.Y - r * 0.5], '#a19d96');
          }
        } });
      });
      // дым
      const nowMs = performance.now();
      for (let i = smoke.length - 1; i >= 0; i--) {
        const p = smoke[i], age = (nowMs - p.born) / 1000 / (p.dust ? 1.3 : 1.0);
        if (age >= 1 || p.s - camS < 1.5) { smoke.splice(i, 1); continue; }
        items.push({ z: p.s - camS, draw: () => {
          const q = proj(p.s, p.x + p.vx * age, 0.2 + age * 1.1);
          const rad = Math.min(W * 0.12, (p.r + age * 0.9) * q.sc);
          const near = Math.min(1, (q.z - 1.5) / 3);
          ctx.fillStyle = p.dust ? `rgba(196,160,118,${0.32 * (1 - age) * near})` : `rgba(220,222,228,${0.38 * (1 - age) * near})`;
          ctx.beginPath(); ctx.arc(q.X, q.Y, rad, 0, Math.PI * 2); ctx.fill();
        } });
      }
      // соперник
      if (sR && rival) {
        const z = sR.s - camS;
        if (z > 1.2 && z < Z_FAR) items.push({ z, draw: () => { const p = proj(sR.s, sR.x); drawCar(p.X, p.Y, 1.9 * p.sc, rival.car, sR, rival.label, false, rival.ai != null ? 0.92 : 0.6); } });
      }
      items.sort((a, b) => b.z - a.z).forEach((it) => it.draw());
      // своя машина
      { const p = proj(sMe.s, sMe.x); const k = keys.current; const bounce = sMe.off ? Math.random() * 2 : Math.sin(sMe.tick * 0.7) * 0.4 * Math.min(1, sMe.v / 30);
        drawCar(p.X, p.Y - bounce, 1.9 * p.sc, me.car, sMe, '', true, 1, live ? (k.R ? 1 : 0) - (k.L ? 1 : 0) : 0); }
      // полосы скорости
      const sp = sMe.v / cpMe.vmax;
      if (sp > 0.55 || sMe.nitroOn) {
        ctx.strokeStyle = sMe.nitroOn ? 'rgba(120,190,255,.45)' : `rgba(255,255,255,${(sp - 0.55) * 0.6})`; ctx.lineWidth = 1.4;
        for (let i = 0; i < (sMe.nitroOn ? 22 : 12); i++) {
          const an = rnd(i + Math.floor(nowMs / 60) * 31) * Math.PI * 2, r0 = W * (0.42 + rnd(i * 3 + Math.floor(nowMs / 60)) * 0.25);
          const x0 = W / 2 + Math.cos(an) * r0, y0 = HOR + Math.sin(an) * r0 * 0.8;
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + Math.cos(an) * 50 * sp, y0 + Math.sin(an) * 40 * sp); ctx.stroke();
        }
      }
      ctx.restore();

      // ---------- HUD ----------
      const top = 10;
      const kmh = sMe.v * 3.6;
      const elapsed = sMe.finished ? sMe.ms : Math.max(0, (sMe.tick - tr.green) * (1000 / D.TICK));
      ctx.textBaseline = 'alphabetic';
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 6;
      // время и отрыв
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = `900 22px ${font}`;
      ctx.fillText(fmtMs(elapsed), W / 2, top + 44);
      if (sR) {
        const gap = sMe.s - sR.s;
        ctx.font = `800 13px ${font}`; ctx.fillStyle = gap >= 0 ? '#7df0a8' : '#ff8d8d';
        ctx.fillText(`${gap >= 0 ? t('впереди') : t('позади')} ${Math.abs(gap).toFixed(Math.abs(gap) < 10 ? 1 : 0).replace('.', ',')} ${t('м')}`, W / 2, top + 62);
      }
      // скорость
      ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.font = `900 34px ${font}`; ctx.fillText(String(Math.round(kmh)), W - 16, top + 50);
      ctx.font = `700 11px ${font}`; ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillText(t('км/ч'), W - 16, top + 64);
      ctx.font = `900 18px ${font}`; ctx.fillStyle = '#ffd23c'; ctx.fillText(sMe.launched ? String(sMe.gear) : 'N', W - 16, top + 86);
      ctx.restore();
      // прогресс
      const bx = 60, bw = W - 120, by = top + 12;
      ctx.fillStyle = 'rgba(0,0,0,.45)'; rrect(bx, by - 3, bw, 6, 3); ctx.fill();
      for (const [st, col] of [...(sR ? [[sR, '#e8eaee']] : []), [sMe, '#ff7a1a']] as [any, string][]) {
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(bx + Math.min(1, st.s / tr.L) * bw, by, 6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1.5; ctx.stroke();
      }
      ctx.font = `15px ${font}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('🏁', bx + bw + 6, by);
      // нитро
      const nx = 16, ny = top + 62, nw = 78;
      ctx.fillStyle = 'rgba(0,0,0,.45)'; rrect(nx, ny, nw, 10, 5); ctx.fill();
      const ng = ctx.createLinearGradient(nx, 0, nx + nw, 0); ng.addColorStop(0, '#3aa0ff'); ng.addColorStop(1, '#9fe0ff');
      ctx.fillStyle = ng; rrect(nx, ny, Math.max(0, nw * (sMe.nitro / sMe.nitroMax)), 10, 5); ctx.fill();
      ctx.font = `800 10px ${font}`; ctx.fillStyle = '#bfe6ff'; ctx.textBaseline = 'alphabetic'; ctx.fillText(t('НИТРО'), nx, ny - 3);
      // тахометр для драга: зелёная зона — переключай
      if (manual) {
        const tx = 16, ty = H - 200, tw2 = W - 32, th2 = 14;
        const rpm = Math.min(1, sMe.rpm);
        const zoneA = sMe.launched ? 0.9 : 0.6, zoneB = sMe.launched ? 0.98 : 0.8;
        ctx.fillStyle = 'rgba(0,0,0,.55)'; rrect(tx, ty, tw2, th2, 7); ctx.fill();
        ctx.fillStyle = 'rgba(60,207,122,.45)'; ctx.fillRect(tx + tw2 * zoneA, ty, tw2 * (zoneB - zoneA), th2);
        ctx.fillStyle = 'rgba(255,77,77,.4)'; ctx.fillRect(tx + tw2 * 0.98, ty, tw2 * 0.02, th2);
        const inZone = rpm >= zoneA && rpm < zoneB;
        const tg2 = ctx.createLinearGradient(tx, 0, tx + tw2, 0); tg2.addColorStop(0, '#ffd23c'); tg2.addColorStop(1, '#ff4d4d');
        ctx.fillStyle = inZone ? '#3ccf7a' : tg2; rrect(tx, ty + 3, tw2 * rpm, th2 - 6, 4); ctx.fill();
        ctx.font = `800 11px ${font}`; ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(t('ОБОРОТЫ'), tx, ty - 5);
        if (sMe.launched && rpm >= 0.98 && sMe.gear < 6) { ctx.textAlign = 'center'; ctx.font = `900 16px ${font}`; ctx.fillStyle = Math.floor(nowMs / 150) % 2 ? '#ff4d4d' : '#fff'; ctx.fillText(t('ПЕРЕКЛЮЧИ!'), W / 2, ty - 8); }
        if (!sMe.launched) { ctx.textAlign = 'center'; ctx.font = `800 13px ${font}`; ctx.fillStyle = '#fff'; ctx.fillText(t('Держи ГАЗ — обороты в зелёной зоне'), W / 2, ty - 8); }
      }
      // светофор
      if (toGreen > -50) {
        const lx = W / 2, ly = H * 0.25, a = toGreen > 0 ? 1 : Math.max(0, 1 + toGreen / 50);
        ctx.globalAlpha = a;
        ctx.fillStyle = 'rgba(8,9,12,.85)'; rrect(lx - 60, ly - 18, 120, 36, 18); ctx.fill();
        for (let i = 0; i < 3; i++) {
          const go = lights >= 4, on = go || lights > i;
          ctx.fillStyle = go ? '#3ccf7a' : on ? '#ff4d4d' : '#2a2f3a';
          ctx.save(); if (on) { ctx.shadowColor = ctx.fillStyle as string; ctx.shadowBlur = 16; }
          ctx.beginPath(); ctx.arc(lx - 34 + i * 34, ly, 11, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
        ctx.globalAlpha = 1;
      }
      // сообщения
      if (msg) {
        const age = (nowMs - msg.at) / 1000;
        if (age > 1.3 && msg.k !== 'finish') msg = null;
        else {
          const [text, col] = MSG[msg.k] ?? ['', '#fff'];
          ctx.save(); ctx.globalAlpha = msg.k === 'finish' ? 1 : Math.min(1, (1.3 - age) * 3); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 10; ctx.fillStyle = col;
          ctx.font = `900 ${msg.k === 'finish' ? 40 : 26 + Math.max(0, 0.15 - age) * 60}px ${font}`;
          ctx.fillText(t(text), W / 2, H * 0.33);
          ctx.restore();
        }
      }
      // звук мотора
      if (eng) {
        const r = manual ? (sMe.launched ? Math.min(1, sMe.rpm) : sMe.rpm) : 0.3 + 0.7 * ((sMe.v / cpMe.vmax) * 6 - Math.floor((sMe.v / cpMe.vmax) * 6));
        eng.set(Math.max(0.1, Math.min(1, r)));
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); eng?.stop(); window.removeEventListener('resize', resize); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // клавиатура (для компьютера): ← → — руль, ↓ — тормоз, пробел — нитро, ↑ — газ/передача
  useEffect(() => {
    if (!live) return;
    const map: Record<string, string> = { ArrowLeft: 'L', ArrowRight: 'R', ArrowDown: 'BRAKE', ' ': 'NITRO', ArrowUp: 'PEDAL', a: 'L', d: 'R', s: 'BRAKE', w: 'PEDAL' };
    const on = (e: KeyboardEvent, v: number) => { const k = map[e.key]; if (!k) return; e.preventDefault(); if (e.repeat) return; press(k, v); };
    const dn = (e: KeyboardEvent) => on(e, 1), up = (e: KeyboardEvent) => on(e, 0);
    window.addEventListener('keydown', dn); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); };
  }, [live]); // eslint-disable-line react-hooks/exhaustive-deps

  const press = (k: string, v: number) => {
    const s = keys.current as any;
    if (k === 'PEDAL' && v) s.pedalFresh = launchedRef.current;
    s[k] = v;
  };
  const launchedRef = useRef(false); launchedRef.current = launched;
  const hold = (k: string) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture?.(e.pointerId); press(k, 1); },
    onPointerUp: () => press(k, 0), onPointerCancel: () => press(k, 0), onLostPointerCapture: () => press(k, 0),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  return (
    <div className="drive">
      <canvas ref={ref} className="drive-cv" />
      {onExit && <button className="drive-exit" onClick={onExit} aria-label={t('Выйти')}><X size={20} /></button>}
      {live && !done && (
        <div className="drive-pad">
          {manual ? (
            <>
              <button className="dp nitro" {...hold('NITRO')}><Flame size={22} /><span>{t('НИТРО')}</span></button>
              <button className={`dp pedal${launched ? ' shift' : ''}`} {...hold('PEDAL')}><span>{launched ? t('ПЕРЕДАЧА') : t('ГАЗ')}</span></button>
            </>
          ) : (
            <>
              <div className="dp-row">
                <button className="dp steer" {...hold('L')}><ChevronLeft size={34} /></button>
                <button className="dp steer" {...hold('R')}><ChevronRight size={34} /></button>
              </div>
              <div className="dp-row">
                <button className="dp brake" {...hold('BRAKE')}><span>{t('ТОРМОЗ')}</span></button>
                <button className="dp nitro" {...hold('NITRO')}><Flame size={22} /><span>{t('НИТРО')}</span></button>
              </div>
            </>
          )}
        </div>
      )}
      {overlay}
    </div>
  );
}
