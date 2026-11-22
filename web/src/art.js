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

const SPOKES = { common: 5, rare: 6, epic: 10, mythic: 7, mystic: 7 };

function wheel(cx, cy, rarity, id) {
  const n = SPOKES[rarity] ?? 5;
  const caliper = rarity === 'mystic' ? '#ff2b3d' : rarity === 'mythic' ? '#ffb800' : rarity === 'epic' ? '#e0262c' : rarity === 'rare' ? '#3d8bff' : '#555b66';
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
  const spoiler = t.spoilerAt && (rarity === 'epic' || rarity === 'mythic' || rarity === 'mystic')
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

// ---------- морской контейнер в цветах флага страны ----------
// Аксонометрия: длинный борт уходит влево, справа двери. Каждая грань рисуется в своих
// «настоящих» координатах (борт 600×260, двери 244×259) и переносится на грань матрицей,
// поэтому флаг, гофра и надписи ложатся ровно, без перекосов.
const FLAG_MAIN = { us: '#1f3a8a', ru: '#d52b1e', jp: '#efefef', cn: '#de2910', de: '#2a2a2a', fr: '#0055a4', it: '#009246', uk: '#012169', world: '#17324f' };
const FLAG_BY_COUNTRY = { 'США': 'us', 'Россия': 'ru', 'Япония': 'jp', 'Китай': 'cn', 'Германия': 'de', 'Франция': 'fr', 'Италия': 'it', 'Великобритания': 'uk' };

function star(cx, cy, r, fill, rot = -90) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = ((rot + i * 36) * Math.PI) / 180, rr = i % 2 ? r * 0.4 : r;
    d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)} `;
  }
  return `<path d="${d}Z" fill="${fill}"/>`;
}

// флаг на весь борт 600×260
function flagArt(f) {
  const W = 600, H = 260;
  const hb = (cols) => cols.map((c, i) => `<rect x="0" y="${(H / cols.length) * i}" width="${W}" height="${H / cols.length + 0.5}" fill="${c}"/>`).join('');
  const vb = (cols) => cols.map((c, i) => `<rect x="${(W / cols.length) * i}" y="0" width="${W / cols.length + 0.5}" height="${H}" fill="${c}"/>`).join('');
  switch (f) {
    case 'us': {
      let s = '';
      for (let i = 0; i < 13; i++) s += `<rect x="0" y="${(H / 13) * i}" width="${W}" height="${H / 13 + 0.5}" fill="${i % 2 ? '#ffffff' : '#b22234'}"/>`;
      s += `<rect x="0" y="0" width="240" height="${(H / 13) * 7}" fill="#3c3b6e"/>`;
      for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) s += star(22 + c * 39 + (r % 2) * 18, 18 + r * 26, 7, '#fff');
      return s;
    }
    case 'uk': return `<rect width="${W}" height="${H}" fill="#012169"/>
      <path d="M0 0 L${W} ${H} M${W} 0 L0 ${H}" stroke="#fff" stroke-width="52"/>
      <path d="M0 0 L${W} ${H} M${W} 0 L0 ${H}" stroke="#c8102e" stroke-width="18"/>
      <path d="M${W / 2} 0 V${H} M0 ${H / 2} H${W}" stroke="#fff" stroke-width="86"/>
      <path d="M${W / 2} 0 V${H} M0 ${H / 2} H${W}" stroke="#c8102e" stroke-width="52"/>`;
    case 'ru': return hb(['#ffffff', '#0039a6', '#d52b1e']);
    case 'de': return hb(['#1b1b1b', '#dd0000', '#ffce00']);
    case 'fr': return vb(['#0055a4', '#ffffff', '#ef4135']);
    case 'it': return vb(['#009246', '#ffffff', '#ce2b37']);
    case 'jp': return `<rect width="${W}" height="${H}" fill="#f4f4f4"/><circle cx="${W / 2}" cy="${H / 2}" r="78" fill="#bc002d"/>`;
    case 'cn': return `<rect width="${W}" height="${H}" fill="#de2910"/>${star(95, 80, 46, '#ffde00')}
      ${star(175, 30, 15, '#ffde00', -60)}${star(205, 62, 15, '#ffde00', -30)}${star(205, 105, 15, '#ffde00', 0)}${star(175, 135, 15, '#ffde00', 20)}`;
    default: return `<rect width="${W}" height="${H}" fill="#17324f"/>
      <g fill="none" stroke="#7fd1ff" stroke-opacity=".75" stroke-width="5">
        <circle cx="300" cy="130" r="92"/><ellipse cx="300" cy="130" rx="40" ry="92"/><ellipse cx="300" cy="130" rx="74" ry="92"/>
        <path d="M208 130 H392 M222 82 H378 M222 178 H378"/></g>`;
  }
}

// текст и маркировка поверх флага: подложка, чтобы читалось на любом флаге
function sideStencil() {
  return `<rect x="22" y="196" width="230" height="44" rx="6" fill="#000" fill-opacity=".38"/>
    <text x="36" y="226" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="26" fill="#fff" letter-spacing="2">CAR CARGO</text>`;
}

export function containerSvg(c, { studio = false, w = 300, h = 170 } = {}) {
  const id = String(c?.id ?? 'x');
  const flag = c?.flag || FLAG_BY_COUNTRY[c?.country] || 'world';
  const main = FLAG_MAIN[flag] ?? '#17324f';
  const code = `CARU ${String(100000 + ((Number(c?.id) || 1) * 48271) % 900000)} ${(Number(c?.id) || 1) % 10}`;
  // грани: борт (0..600 × 0..260), двери (0..244 × 0..259), крыша (0..600 × 0..244)
  const SIDE = 'matrix(0.3067 0.0367 0 0.3846 16 30)';
  const FRONT = 'matrix(0.3279 -0.041 0 0.3861 200 52)';
  const TOP = 'matrix(0.3067 0.0367 0.3279 -0.041 16 30)';
  let ribs = '';
  for (let x = 12; x < 600; x += 24) ribs += `<rect x="${x}" y="0" width="10" height="260" fill="#000" opacity=".13"/><rect x="${x + 10}" y="0" width="2.5" height="260" fill="#fff" opacity=".16"/>`;
  let doorRibs = '';
  for (let x = 10; x < 244; x += 20) doorRibs += `<rect x="${x}" y="14" width="8" height="231" fill="#000" opacity=".14"/>`;
  let rods = '';
  for (const x of [34, 88, 156, 210]) {
    rods += `<rect x="${x - 3}" y="10" width="6" height="239" rx="3" fill="#c9ced6"/><rect x="${x + 1}" y="10" width="2" height="239" fill="#6b717b"/>
      <rect x="${x - 7}" y="22" width="14" height="8" rx="2" fill="#7d838d"/><rect x="${x - 7}" y="229" width="14" height="8" rx="2" fill="#7d838d"/>
      <rect x="${x - 4}" y="150" width="22" height="9" rx="3" fill="#a9afb8" stroke="#4d535c" stroke-width="1.5"/>`;
  }
  const corner = (x, y) => `<rect x="${x - 5}" y="${y - 5}" width="10" height="10" rx="1.5" fill="#24272c"/><rect x="${x - 2.5}" y="${y - 1.5}" width="5" height="3" rx="1" fill="#0d0f12"/>`;
  const bg = studio ? `
    <defs>
      <radialGradient id="cspot${id}" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#2d3446"/><stop offset=".6" stop-color="#151a26"/><stop offset="1" stop-color="#0a0c12"/></radialGradient>
      <linearGradient id="cfloor${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#20263a"/><stop offset="1" stop-color="#0c0f15"/></linearGradient>
    </defs>
    <rect x="-30" y="-20" width="360" height="220" fill="url(#cspot${id})"/>
    <path d="M-30 152 L330 152 L330 200 L-30 200 Z" fill="url(#cfloor${id})"/>
    <path d="M-30 152 L330 152" stroke="rgba(255,255,255,.07)"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${studio ? '-20 -2 340 190' : '6 12 284 152'}" width="${w}" height="${h}">
  ${bg}
  <defs>
    <linearGradient id="sideShade${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".42"/><stop offset="1" stop-color="#000" stop-opacity=".06"/></linearGradient>
    <linearGradient id="dirt${id}" x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stop-color="#4a2a14" stop-opacity="0"/><stop offset="1" stop-color="#4a2a14" stop-opacity=".45"/></linearGradient>
    <linearGradient id="frontShade${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".10"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient>
    <radialGradient id="csh${id}" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#000" stop-opacity=".8"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
  </defs>
  <ellipse cx="150" cy="154" rx="148" ry="9" fill="url(#csh${id})"/>
  <g transform="${TOP}">
    <rect width="600" height="244" fill="${main}"/><rect width="600" height="244" fill="#fff" opacity=".28"/>
    ${Array.from({ length: 24 }, (_, i) => `<rect x="${i * 25 + 6}" y="0" width="10" height="244" fill="#000" opacity=".07"/>`).join('')}
    <rect width="600" height="244" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="8"/>
  </g>
  <g transform="${SIDE}">
    ${flagArt(flag)}
    ${ribs}
    <rect width="600" height="260" fill="url(#sideShade${id})"/>
    <rect width="600" height="260" fill="url(#dirt${id})"/>
    ${sideStencil()}
    <rect x="0" y="0" width="600" height="14" fill="#1d2026" opacity=".75"/>
    <rect x="0" y="244" width="600" height="16" fill="#15171b" opacity=".85"/>
    <rect x="0" y="0" width="14" height="260" fill="#1d2026" opacity=".8"/>
    ${corner(7, 7)}${corner(7, 252)}
  </g>
  <g transform="${FRONT}">
    <rect width="244" height="259" fill="${main}"/>
    ${flag === 'jp' ? '<circle cx="190" cy="70" r="22" fill="#bc002d"/>' : ''}
    ${doorRibs}
    <rect width="244" height="259" fill="url(#frontShade${id})"/>
    <rect width="244" height="259" fill="url(#dirt${id})" opacity=".8"/>
    <rect x="120" y="10" width="4" height="239" fill="#000" opacity=".55"/>
    ${rods}
    <rect x="12" y="34" width="96" height="36" rx="4" fill="#000" fill-opacity=".32"/>
    <text x="18" y="50" font-family="Arial, sans-serif" font-weight="700" font-size="12" fill="#fff">${code}</text>
    <text x="18" y="64" font-family="Arial, sans-serif" font-size="9" fill="#fff" fill-opacity=".75">22G1 · MAX 30480 KG</text>
    <rect x="0" y="0" width="244" height="12" fill="#1d2026" opacity=".8"/>
    <rect x="0" y="245" width="244" height="14" fill="#15171b" opacity=".85"/>
    <rect x="0" y="0" width="10" height="259" fill="#1d2026" opacity=".8"/><rect x="234" y="0" width="10" height="259" fill="#1d2026" opacity=".8"/>
    ${corner(5, 6)}${corner(239, 6)}${corner(5, 253)}${corner(239, 253)}
  </g>
  <path d="M16 30 L200 52 L280 42" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="1"/>
  <path d="M200 52 L200 152" stroke="#000" stroke-opacity=".5" stroke-width="1"/>
</svg>`;
}

// Плоский борт контейнера (600×260) — грань 3D-коробки при открытии.
export function containerSideSvg(c) {
  const flag = c?.flag || FLAG_BY_COUNTRY[c?.country] || 'world';
  let ribs = '';
  for (let x = 12; x < 600; x += 24) ribs += `<rect x="${x}" y="0" width="10" height="260" fill="#000" opacity=".13"/><rect x="${x + 10}" y="0" width="2.5" height="260" fill="#fff" opacity=".16"/>`;
  const corner = (x, y) => `<rect x="${x - 6}" y="${y - 6}" width="12" height="12" rx="1.5" fill="#24272c"/><rect x="${x - 3}" y="${y - 2}" width="6" height="4" rx="1" fill="#0d0f12"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 260" width="600" height="260">
  <defs><linearGradient id="sd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".08"/><stop offset=".6" stop-color="#4a2a14" stop-opacity="0"/><stop offset="1" stop-color="#4a2a14" stop-opacity=".45"/></linearGradient></defs>
  ${flagArt(flag)}${ribs}<rect width="600" height="260" fill="url(#sd)"/>${sideStencil()}
  <rect x="0" y="0" width="600" height="14" fill="#1d2026"/><rect x="0" y="246" width="600" height="14" fill="#15171b"/>
  <rect x="0" y="0" width="12" height="260" fill="#1d2026"/><rect x="588" y="0" width="12" height="260" fill="#1d2026"/>
  ${corner(6, 7)}${corner(594, 7)}${corner(6, 253)}${corner(594, 253)}
</svg>`;
}
// Крыша (600×244): цвет контейнера, рёбра.
export function containerTopSvg(c) {
  const flag = c?.flag || FLAG_BY_COUNTRY[c?.country] || 'world';
  const main = FLAG_MAIN[flag] ?? '#17324f';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 244" width="600" height="244">
  <rect width="600" height="244" fill="${main}"/><rect width="600" height="244" fill="#fff" opacity=".22"/>
  ${Array.from({ length: 24 }, (_, i) => `<rect x="${i * 25 + 6}" y="0" width="10" height="244" fill="#000" opacity=".08"/>`).join('')}
  <rect width="600" height="244" fill="none" stroke="#1d2026" stroke-width="16"/>
</svg>`;
}

// Торец контейнера с дверями (вид прямо): side — 'l' / 'r' (одна створка) или 'both'.
export function containerDoorSvg(c, side = 'both') {
  const flag = c?.flag || FLAG_BY_COUNTRY[c?.country] || 'world';
  const main = FLAG_MAIN[flag] ?? '#17324f';
  const code = `CARU ${String(100000 + ((Number(c?.id) || 1) * 48271) % 900000)} ${(Number(c?.id) || 1) % 10}`;
  let ribs = '';
  for (let x = 14; x < 240; x += 16) if (Math.abs(x - 122) > 8) ribs += `<rect x="${x}" y="16" width="7" height="227" fill="#000" opacity=".16"/><rect x="${x + 7}" y="16" width="2" height="227" fill="#fff" opacity=".12"/>`;
  let rods = '';
  for (const x of [38, 88, 156, 206]) {
    rods += `<rect x="${x - 3}" y="12" width="6" height="235" rx="3" fill="#cfd4db"/><rect x="${x + 1}" y="12" width="2" height="235" fill="#6b717b"/>
      <rect x="${x - 7}" y="24" width="14" height="8" rx="2" fill="#7d838d"/><rect x="${x - 7}" y="227" width="14" height="8" rx="2" fill="#7d838d"/>
      <rect x="${x - 4}" y="148" width="24" height="10" rx="3" fill="#b4bac3" stroke="#4d535c" stroke-width="1.5"/>`;
  }
  const corner = (x, y) => `<rect x="${x - 6}" y="${y - 6}" width="12" height="12" rx="1.5" fill="#24272c"/><rect x="${x - 3}" y="${y - 2}" width="6" height="4" rx="1" fill="#0d0f12"/>`;
  const vb = side === 'l' ? '0 0 122 259' : side === 'r' ? '122 0 122 259' : '0 0 244 259';
  const [w, h] = side === 'both' ? [244, 259] : [122, 259];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${w}" height="${h}">
  <defs>
    <linearGradient id="ds" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".14"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></linearGradient>
    <linearGradient id="dd" x1="0" y1="0" x2="0" y2="1"><stop offset=".6" stop-color="#4a2a14" stop-opacity="0"/><stop offset="1" stop-color="#4a2a14" stop-opacity=".4"/></linearGradient>
  </defs>
  <rect width="244" height="259" fill="${main}"/>
  ${flag === 'jp' ? '<circle cx="183" cy="72" r="24" fill="#bc002d"/>' : ''}
  ${ribs}
  <rect width="244" height="259" fill="url(#ds)"/><rect width="244" height="259" fill="url(#dd)"/>
  <rect x="120" y="12" width="4" height="235" fill="#000" opacity=".6"/>
  ${rods}
  <rect x="14" y="36" width="96" height="36" rx="4" fill="#000" fill-opacity=".32"/>
  <text x="20" y="52" font-family="Arial, sans-serif" font-weight="700" font-size="12" fill="#fff">${code}</text>
  <text x="20" y="66" font-family="Arial, sans-serif" font-size="9" fill="#fff" fill-opacity=".75">22G1 · MAX 30480 KG</text>
  <rect x="0" y="0" width="244" height="12" fill="#1d2026"/><rect x="0" y="247" width="244" height="12" fill="#15171b"/>
  <rect x="0" y="0" width="10" height="259" fill="#1d2026"/><rect x="234" y="0" width="10" height="259" fill="#1d2026"/>
  ${corner(5, 6)}${corner(239, 6)}${corner(5, 253)}${corner(239, 253)}
</svg>`;
}

export const svgUrl = (svg) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
