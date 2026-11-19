// art.js — собственные иллюстрации машин и морских контейнеров (SVG), без чужих
// фото и логотипов. Используются в Mini App, а для бота заранее рендерятся в JPEG.

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
function hex(h) {
  const m = /^#?([0-9a-f]{6})$/i.exec(h || '') ?? [0, '888888'];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgb = ([r, g, b]) => `rgb(${clamp(r)},${clamp(g)},${clamp(b)})`;
const shade = (h, k) => { const c = hex(h); return rgb(k >= 0 ? c.map((v) => v + (255 - v) * k) : c.map((v) => v * (1 + k))); };

// ---------- машины ----------
// Вид сбоку, нос вправо. Колёса: центры (95,130) и (305,130), радиус 30, земля y=160.
const ARCH = 'L340 150 A36 36 0 0 0 268 150 L132 150 A36 36 0 0 0 60 150';
const BODIES = {
  sedan: {
    body: `M30 150 L25 120 Q24 106 40 101 L108 96 Q132 74 156 64 Q196 57 244 60 Q266 63 300 92 L352 101 Q374 105 379 118 L381 141 L373 150 ${ARCH} Z`,
    glass: 'M118 95 Q140 76 160 68 Q198 62 242 64 Q258 67 290 93 Z', pillars: [204], doors: [134, 205, 282], light: [352, 103, 377, 112],
  },
  hatch: {
    body: `M32 150 L27 112 Q27 84 50 70 L82 62 Q160 56 240 59 Q262 61 300 92 L352 101 Q374 105 379 118 L381 141 L373 150 ${ARCH} Z`,
    glass: 'M58 93 L70 72 Q88 65 120 63 L238 63 Q256 66 290 93 Z', pillars: [118, 206], doors: [128, 206, 284], light: [352, 103, 377, 112],
  },
  coupe: {
    body: `M26 148 L24 120 Q25 106 44 101 L94 95 Q132 70 172 64 L232 63 Q262 66 298 95 L356 104 Q377 108 381 122 L382 142 L373 150 ${ARCH} Z`,
    glass: 'M108 95 Q140 73 174 68 L230 67 Q254 70 286 96 Z', pillars: [], doors: [170, 272], light: [356, 106, 380, 115], spoilerAt: 30,
  },
  super: {
    body: `M22 142 L22 118 Q28 106 58 101 L118 93 Q158 76 198 73 L238 75 Q276 83 314 101 L366 113 Q383 119 385 133 L383 146 L373 150 ${ARCH} Z`,
    glass: 'M134 94 Q166 80 200 77 L234 79 Q262 86 292 101 Z', pillars: [], doors: [168, 262], light: [360, 114, 384, 122], intake: true, spoilerAt: 26, low: true,
  },
  wagon: {
    body: `M30 150 L25 112 Q24 76 44 67 L84 61 Q170 57 248 60 Q266 62 300 92 L352 101 Q374 105 379 118 L381 141 L373 150 ${ARCH} Z`,
    glass: 'M48 92 L56 72 Q66 66 90 65 L244 64 Q258 67 290 93 Z', pillars: [118, 206], doors: [130, 206, 282], light: [352, 103, 377, 112],
  },
  suv: {
    body: 'M26 146 L24 104 Q24 56 46 48 L90 44 Q170 41 246 43 Q266 45 298 80 L356 92 Q377 96 379 112 L381 139 L373 146 L344 146 A38 38 0 0 0 266 146 L134 146 A38 38 0 0 0 56 146 Z',
    glass: 'M50 82 L58 56 Q70 50 96 49 L240 48 Q256 51 288 82 Z', pillars: [120, 206], doors: [134, 206, 282], light: [354, 94, 378, 104], tall: true,
  },
};

const SPOKES = { common: 5, rare: 6, epic: 10, mythic: 7 };

function wheel(cx, cy, rarity, id) {
  const n = SPOKES[rarity] ?? 5;
  const caliper = rarity === 'mythic' ? '#ffb800' : rarity === 'epic' ? '#e0262c' : rarity === 'rare' ? '#3d8bff' : '#555b66';
  let spokes = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const w = rarity === 'epic' ? 2.2 : 4.2;
    const x1 = cx + Math.cos(a) * 6, y1 = cy + Math.sin(a) * 6;
    const x2 = cx + Math.cos(a) * 19, y2 = cy + Math.sin(a) * 19;
    spokes += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="url(#rim${id})" stroke-width="${w}" stroke-linecap="round"/>`;
  }
  return `
  <g>
    <circle cx="${cx}" cy="${cy}" r="30" fill="#111317"/>
    <circle cx="${cx}" cy="${cy}" r="29" fill="none" stroke="#2a2e36" stroke-width="3"/>
    <path d="M${cx - 24} ${cy - 17} A29 29 0 0 1 ${cx + 10} ${cy - 27}" stroke="#4a505a" stroke-width="1.5" fill="none" opacity=".8"/>
    <circle cx="${cx}" cy="${cy}" r="21.5" fill="#1b1e24"/>
    <circle cx="${cx}" cy="${cy}" r="15" fill="#3a3f48"/>
    <circle cx="${cx}" cy="${cy}" r="15" fill="none" stroke="#565c66" stroke-width="1" stroke-dasharray="2 2"/>
    <path d="M${cx + 9} ${cy - 13} A16 16 0 0 1 ${cx + 15} ${cy + 3}" stroke="${caliper}" stroke-width="5" fill="none" stroke-linecap="round"/>
    ${spokes}
    <circle cx="${cx}" cy="${cy}" r="21" fill="none" stroke="url(#rim${id})" stroke-width="2.5"/>
    <circle cx="${cx}" cy="${cy}" r="5.5" fill="url(#rim${id})"/>
    <circle cx="${cx}" cy="${cy}" r="2" fill="#2a2e36"/>
  </g>`;
}

export function carSvg(car, { studio = false, w = 400, h = 180 } = {}) {
  const id = String(car?.id ?? 'x');
  const t = BODIES[car?.body] ?? BODIES.sedan;
  const rarity = car?.rarity ?? 'common';
  const paint = car?.color || '#8a8f98';
  const bg = studio ? `
    <defs>
      <radialGradient id="spot${id}" cx="50%" cy="38%" r="70%">
        <stop offset="0" stop-color="#2b3246"/><stop offset=".55" stop-color="#151a26"/><stop offset="1" stop-color="#090b11"/>
      </radialGradient>
      <linearGradient id="floor${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#1a2030"/><stop offset="1" stop-color="#0b0e15"/>
      </linearGradient>
    </defs>
    <rect x="-40" y="-40" width="480" height="260" fill="url(#spot${id})"/>
    <path d="M-40 150 L440 150 L440 220 L-40 220 Z" fill="url(#floor${id})"/>
    <path d="M-40 150 L440 150" stroke="rgba(255,255,255,.06)"/>` : '';
  const doors = t.doors.map((x) => `<path d="M${x} ${t.tall ? 84 : 97} L${x + (t.low ? 6 : 3)} ${t.tall ? 140 : 146}" stroke="rgba(0,0,0,.35)" stroke-width="1.2"/>`).join('');
  const handles = t.doors.slice(0, -1).map((x, i) => `<rect x="${(x + t.doors[i + 1]) / 2 + 8}" y="${t.tall ? 96 : 108}" width="16" height="3.4" rx="1.7" fill="${shade(paint, -0.45)}" opacity=".8"/>`).join('');
  const pillars = t.pillars.map((x) => `<rect x="${x - 4}" y="40" width="8" height="70" fill="url(#paint${id})"/>`).join('');
  const [lx1, ly1, lx2, ly2] = t.light;
  const spoiler = t.spoilerAt && (rarity === 'epic' || rarity === 'mythic')
    ? `<path d="M${t.spoilerAt - 6} ${t.low ? 92 : 94} L${t.spoilerAt + 34} ${t.low ? 92 : 94} L${t.spoilerAt + 30} ${t.low ? 98 : 100} L${t.spoilerAt - 2} ${t.low ? 99 : 101} Z" fill="${shade(paint, -0.55)}"/>
       <rect x="${t.spoilerAt + 6}" y="${t.low ? 97 : 99}" width="4" height="6" fill="#1b1e24"/>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${studio ? '-20 -10 440 200' : '0 20 400 160'}" width="${w}" height="${h}">
  ${bg}
  <defs>
    <linearGradient id="paint${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${shade(paint, 0.35)}"/>
      <stop offset=".32" stop-color="${shade(paint, 0.08)}"/>
      <stop offset=".55" stop-color="${paint}"/>
      <stop offset="1" stop-color="${shade(paint, -0.55)}"/>
    </linearGradient>
    <linearGradient id="glass${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#9fb4c8"/><stop offset=".35" stop-color="#2c3a4c"/><stop offset="1" stop-color="#0d1219"/>
    </linearGradient>
    <linearGradient id="spec${id}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".45" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="rim${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${rarity === 'mythic' ? '#fff3c4' : '#f2f4f7'}"/><stop offset=".5" stop-color="${rarity === 'mythic' ? '#c9a24a' : '#9aa2ad'}"/><stop offset="1" stop-color="${rarity === 'mythic' ? '#7a5a1c' : '#4c535d'}"/>
    </linearGradient>
    <linearGradient id="head${id}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#cfe6ff"/><stop offset="1" stop-color="#ffffff"/>
    </linearGradient>
    <radialGradient id="shadow${id}" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#000" stop-opacity=".7"/><stop offset="1" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="clip${id}"><path d="${t.body}"/></clipPath>
  </defs>
  <ellipse cx="200" cy="161" rx="190" ry="11" fill="url(#shadow${id})"/>
  <ellipse cx="95" cy="160" rx="34" ry="4" fill="#000" opacity=".7"/><ellipse cx="305" cy="160" rx="34" ry="4" fill="#000" opacity=".7"/>
  <g id="car${id}">
  <path d="${t.body}" fill="url(#paint${id})"/>
  <g clip-path="url(#clip${id})">
    <path d="${t.glass}" fill="url(#glass${id})"/>
    <path d="${t.glass}" fill="none" stroke="#0b0e13" stroke-width="2.5"/>
    ${pillars}
    <path d="M${t.tall ? 60 : 110} ${t.tall ? 58 : 70} L${t.tall ? 140 : 170} ${t.tall ? 52 : 64} L${t.tall ? 120 : 150} ${t.tall ? 80 : 92} L${t.tall ? 40 : 90} ${t.tall ? 86 : 96} Z" fill="#fff" opacity=".10"/>
    <path d="M20 ${t.tall ? 96 : 106} Q200 ${t.tall ? 86 : 96} 390 ${t.tall ? 98 : 108} L390 ${t.tall ? 104 : 114} Q200 ${t.tall ? 92 : 102} 20 ${t.tall ? 102 : 112} Z" fill="url(#spec${id})" opacity=".75"/>
    <path d="M20 ${t.tall ? 106 : 116} Q200 ${t.tall ? 98 : 108} 390 ${t.tall ? 110 : 120}" stroke="#fff" stroke-opacity=".22" fill="none"/>
    <path d="M40 ${t.tall ? 122 : 128} Q200 ${t.tall ? 118 : 124} 370 ${t.tall ? 124 : 130}" stroke="#000" stroke-opacity=".25" fill="none" stroke-width="1.5"/>
    <rect x="0" y="${t.tall ? 128 : 134}" width="400" height="30" fill="#000" opacity=".28"/>
    ${doors}${handles}
    <path d="M${lx1} ${ly1} L${lx2} ${ly1 + 3} L${lx2 - 2} ${ly2} L${lx1 + 4} ${ly2} Z" fill="url(#head${id})"/>
    <circle cx="${lx1 + (lx2 - lx1) * 0.62}" cy="${(ly1 + ly2) / 2 + 1}" r="${(ly2 - ly1) / 2.6}" fill="#eaf4ff" stroke="#7d8da0" stroke-width=".8"/>
    <path d="M${lx1 + 2} ${ly2 + 1} L${lx2 - 4} ${ly2 + 1}" stroke="#ffd27a" stroke-width="1.5" opacity=".8"/>
    <rect x="${t.low ? 22 : 24}" y="${t.tall ? 92 : t.low ? 112 : 106}" width="13" height="${t.tall ? 14 : 8}" rx="2" fill="#c0141c"/>
    <rect x="${t.low ? 23 : 25}" y="${t.tall ? 93 : t.low ? 113 : 107}" width="8" height="2.5" rx="1" fill="#ff6a5c"/>
    <rect x="352" y="${t.tall ? 118 : 126}" width="26" height="${t.tall ? 12 : 9}" rx="3" fill="#15181d"/>
    ${t.intake ? '<path d="M134 112 Q150 104 166 106 L164 124 Q150 122 138 126 Z" fill="#0f1216" opacity=".85"/><path d="M138 112 L162 109" stroke="#fff" stroke-opacity=".15"/>' : ''}
  </g>
  <path d="${t.body}" fill="none" stroke="rgba(0,0,0,.45)" stroke-width="1.2"/>
  <path d="M${t.tall ? 288 : 290} ${t.tall ? 82 : 93} l10 -4 l4 8 l-12 2 Z" fill="${shade(paint, -0.3)}"/>
  ${spoiler}
  ${wheel(95, 130, rarity, id)}
  ${wheel(305, 130, rarity, id)}
  </g>
  ${studio ? `<defs><linearGradient id="rf${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <mask id="rm${id}"><rect x="-40" y="160" width="480" height="60" fill="url(#rf${id})"/></mask></defs>
    <g mask="url(#rm${id})"><use href="#car${id}" transform="translate(0 320) scale(1 -1)"/></g>` : ''}
</svg>`;
  return svg;
}

// ---------- морской контейнер ----------
// Вид три четверти: длинный борт уходит влево, справа двери с запорами.
export function containerSvg(c, { studio = false, w = 300, h = 170 } = {}) {
  const id = String(c?.id ?? 'x');
  const color = c?.color || ['#8a5a2b', '#b8322a', '#6b7480', '#1f4f9c', '#2f6b45'][(Number(c?.id) || 0) % 5];
  const flag = c?.emoji ?? '';
  const code = c?.code || `CARU ${String(100000 + ((Number(c?.id) || 1) * 48271) % 900000)} ${(Number(c?.id) || 1) % 10}`;
  // борт: от (20,30)-(20,138) к (200,42)-(200,160)
  const S = { tl: [20, 30], bl: [20, 138], tr: [200, 42], br: [200, 160] };
  const F = { tl: [200, 42], tr: [284, 50], br: [284, 152], bl: [200, 160] };
  const lerp = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  let ribs = '';
  const N = 26;
  for (let i = 0; i < N; i++) {
    const k0 = (i + 0.15) / N, k1 = (i + 0.55) / N;
    const p = [lerp(S.tl, S.tr, k0), lerp(S.tl, S.tr, k1), lerp(S.bl, S.br, k1), lerp(S.bl, S.br, k0)];
    ribs += `<path d="M${p.map((q) => q.map((v) => v.toFixed(1)).join(' ')).join(' L')} Z" fill="#000" opacity=".16"/>`;
    const e = lerp(S.tl, S.tr, k1), e2 = lerp(S.bl, S.br, k1);
    ribs += `<path d="M${e[0].toFixed(1)} ${(e[1] + 6).toFixed(1)} L${e2[0].toFixed(1)} ${(e2[1] - 6).toFixed(1)}" stroke="#fff" stroke-opacity=".12" stroke-width="1"/>`;
  }
  let doorRibs = '';
  for (let i = 1; i < 12; i++) {
    const k = i / 12;
    const a = lerp(F.tl, F.tr, k), b = lerp(F.bl, F.br, k);
    doorRibs += `<path d="M${a[0].toFixed(1)} ${(a[1] + 8).toFixed(1)} L${b[0].toFixed(1)} ${(b[1] - 8).toFixed(1)}" stroke="#000" stroke-opacity=".18" stroke-width="2.2"/>`;
  }
  let rods = '';
  for (const k of [0.14, 0.36, 0.64, 0.86]) {
    const a = lerp(F.tl, F.tr, k), b = lerp(F.bl, F.br, k);
    rods += `<path d="M${a[0].toFixed(1)} ${(a[1] + 6).toFixed(1)} L${b[0].toFixed(1)} ${(b[1] - 6).toFixed(1)}" stroke="#c9ced6" stroke-width="2.4"/>
      <path d="M${a[0].toFixed(1)} ${(a[1] + 6).toFixed(1)} L${b[0].toFixed(1)} ${(b[1] - 6).toFixed(1)}" stroke="#5b616b" stroke-width="1" transform="translate(1.2 0)"/>`;
    const m = lerp(a, b, 0.62);
    rods += `<rect x="${(m[0] - 2).toFixed(1)}" y="${(m[1] - 3).toFixed(1)}" width="9" height="5" rx="1.5" fill="#9aa1ab" stroke="#4a5059" stroke-width=".8"/>`;
    for (const kk of [0.08, 0.92]) { const q = lerp(a, b, kk); rods += `<rect x="${(q[0] - 3).toFixed(1)}" y="${(q[1] - 2).toFixed(1)}" width="6" height="4" fill="#6c727c"/>`; }
  }
  const mid = [lerp(F.tl, F.tr, 0.5), lerp(F.bl, F.br, 0.5)];
  const corner = (x, y) => `<rect x="${x - 4}" y="${y - 4}" width="8" height="8" rx="1" fill="#2a2d33"/><rect x="${x - 2}" y="${y - 1.5}" width="4" height="3" rx="1" fill="#0f1114"/>`;
  const bg = studio ? `
    <defs>
      <radialGradient id="cspot${id}" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#2a3142"/><stop offset=".6" stop-color="#141925"/><stop offset="1" stop-color="#090b11"/></radialGradient>
      <linearGradient id="cfloor${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#232a38"/><stop offset="1" stop-color="#0c0f15"/></linearGradient>
    </defs>
    <rect x="-30" y="-20" width="360" height="220" fill="url(#cspot${id})"/>
    <path d="M-30 150 L330 150 L330 200 L-30 200 Z" fill="url(#cfloor${id})"/>
    ${[0, 1, 2, 3, 4, 5].map((i) => `<path d="M${-30 + i * 70} 200 L${20 + i * 50} 150" stroke="rgba(255,220,120,.05)" stroke-width="2"/>`).join('')}` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${studio ? '-20 -5 340 190' : '0 15 300 160'}" width="${w}" height="${h}">
  ${bg}
  <defs>
    <linearGradient id="side${id}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${shade(color, -0.45)}"/><stop offset="1" stop-color="${shade(color, -0.12)}"/>
    </linearGradient>
    <linearGradient id="front${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${shade(color, 0.12)}"/><stop offset="1" stop-color="${shade(color, -0.2)}"/>
    </linearGradient>
    <linearGradient id="rust${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5a2f16" stop-opacity="0"/><stop offset="1" stop-color="#5a2f16" stop-opacity=".55"/>
    </linearGradient>
    <radialGradient id="csh${id}" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#000" stop-opacity=".75"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
  </defs>
  <ellipse cx="150" cy="158" rx="150" ry="9" fill="url(#csh${id})"/>
  <path d="M20 30 L105 22 L284 50 L200 42 Z" fill="${shade(color, 0.22)}"/>
  <path d="M20 30 L200 42 L200 160 L20 138 Z" fill="url(#side${id})"/>
  ${ribs}
  <path d="M20 112 L200 130 L200 160 L20 138 Z" fill="url(#rust${id})"/>
  <path d="M20 30 L200 42 L200 50 L20 37 Z" fill="#000" opacity=".25"/>
  <path d="M20 132 L200 152 L200 160 L20 138 Z" fill="#000" opacity=".35"/>
  <text x="70" y="78" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="15" fill="#fff" fill-opacity=".82" transform="skewY(3.8)" letter-spacing="1">CAR CARGO</text>
  <text x="71" y="94" font-family="Arial, sans-serif" font-size="8" fill="#fff" fill-opacity=".6" transform="skewY(3.8)" letter-spacing="2">AUCTION LINE</text>
  <path d="M200 42 L284 50 L284 152 L200 160 Z" fill="url(#front${id})"/>
  ${doorRibs}
  <path d="M${mid[0][0]} ${mid[0][1]} L${mid[1][0]} ${mid[1][1]}" stroke="#000" stroke-opacity=".55" stroke-width="1.6"/>
  <path d="M200 42 L284 50 L284 57 L200 50 Z" fill="#000" opacity=".22"/>
  <path d="M200 151 L284 144 L284 152 L200 160 Z" fill="#000" opacity=".35"/>
  <path d="M200 125 L284 120 L284 152 L200 160 Z" fill="url(#rust${id})" opacity=".8"/>
  ${rods}
  <text x="212" y="66" font-family="Arial, sans-serif" font-weight="700" font-size="6.5" fill="#fff" fill-opacity=".85" transform="skewY(5.4)">${code}</text>
  <text x="212" y="74" font-family="Arial, sans-serif" font-size="5" fill="#fff" fill-opacity=".6" transform="skewY(5.4)">22G1 · MAX GR 30480 KG</text>
  ${flag ? `<text x="256" y="100" font-size="16" transform="skewY(5.4)">${flag}</text>` : ''}
  ${corner(21, 33)}${corner(21, 135)}${corner(200, 45)}${corner(200, 157)}${corner(283, 53)}${corner(283, 149)}
  <path d="M20 30 L200 42 L284 50" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="1"/>
</svg>`;
}

export const svgUrl = (svg) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
