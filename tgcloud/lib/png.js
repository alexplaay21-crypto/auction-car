// lib/png.js — минимальный PNG-кодировщик (палитра, без сжатия) для картинок графиков.
// На платформе нет библиотек изображений, поэтому PNG собирается вручную:
// IHDR + PLTE + IDAT (zlib с «сохранёнными» блоками без сжатия) + IEND.

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u32(n) { return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]; }

function chunk(type, data) {
  const t = [...type].map((c) => c.charCodeAt(0));
  const body = new Uint8Array(4 + data.length);
  body.set(t, 0);
  body.set(data, 4);
  const out = new Uint8Array(12 + data.length);
  out.set(u32(data.length), 0);
  out.set(body, 4);
  out.set(u32(crc32(body)), 8 + data.length);
  return out;
}

// zlib-поток из несжатых блоков (каждый до 65535 байт).
function zlibStored(raw) {
  const blocks = Math.ceil(raw.length / 65535) || 1;
  const out = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  out[0] = 0x78; out[1] = 0x01;
  let o = 2;
  for (let i = 0; i < blocks; i++) {
    const start = i * 65535, len = Math.min(65535, raw.length - start);
    out[o++] = i === blocks - 1 ? 1 : 0;
    out[o++] = len & 255; out[o++] = len >>> 8;
    out[o++] = ~len & 255; out[o++] = (~len >>> 8) & 255;
    out.set(raw.subarray(start, start + len), o);
    o += len;
  }
  let a = 1, b = 0;
  for (let i = 0; i < raw.length; i++) { a = (a + raw[i]) % 65521; b = (b + a) % 65521; }
  out.set(u32(((b << 16) | a) >>> 0), o);
  return out;
}

// pixels — индексы палитры (width × height), palette — [[r,g,b], ...].
export function encodePNG(width, height, palette, pixels) {
  const raw = new Uint8Array((width + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0; // фильтр «нет»
    raw.set(pixels.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  }
  const ihdr = new Uint8Array([...u32(width), ...u32(height), 8, 3, 0, 0, 0]);
  const plte = new Uint8Array(palette.flat());
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('PLTE', plte), chunk('IDAT', zlibStored(raw)), chunk('IEND', new Uint8Array(0))];
  const total = parts.reduce((s, p) => s + p.length, 0);
  const png = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { png.set(p, o); o += p.length; }
  return png;
}
