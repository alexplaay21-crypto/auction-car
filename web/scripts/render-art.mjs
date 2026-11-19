// Рендер картинок стартового каталога для бота: SVG из src/art.js → JPEG в public/art/.
// Telegram не принимает SVG как фото, поэтому бот берёт эти JPEG по ссылке на Mini App.
// Запуск: node web/scripts/render-art.mjs (нужен Playwright с Chromium).
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { carSvg, containerSvg } from '../src/art.js';
import { CATALOG as CATALOG1, CATALOG_V3, ALL_CONTAINERS as CONTAINERS } from '../../tgcloud/lib/catalog.js';
const CATALOG = [...CATALOG1, ...CATALOG_V3];

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = new URL('..', import.meta.url).pathname;
const out = root + 'public/art/';
mkdirSync(out, { recursive: true });

const jobs = [
  ...CATALOG.map((c, i) => ({ file: `car-${i + 1}.jpg`, svg: carSvg({ ...c, id: i + 1 }, { studio: true, w: 880, h: 400 }), w: 880, h: 400 })),
  ...CONTAINERS.map((c, i) => ({ file: `container-${i + 1}.jpg`, svg: containerSvg({ ...c, id: i + 1 }, { studio: true, w: 680, h: 380 }), w: 680, h: 380 })),
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const j of jobs) {
  await page.setViewportSize({ width: j.w, height: j.h });
  await page.setContent(`<html><body style="margin:0;background:#0c0f17">${j.svg}</body></html>`);
  writeFileSync(out + j.file, await page.screenshot({ type: 'jpeg', quality: 88, clip: { x: 0, y: 0, width: j.w, height: j.h } }));
}
await browser.close();

// версия картинок — от содержимого рисовалки и каталога (для сброса кэша Telegram)
const v = createHash('sha1').update(readFileSync(root + 'src/art.js')).update(JSON.stringify(CATALOG)).digest('hex').slice(0, 8);
writeFileSync(root + '../tgcloud/lib/art_manifest.js',
  `// Создано web/scripts/render-art.mjs — картинки стартового каталога для бота.\nexport const ART = { v: '${v}', cars: ${CATALOG.length}, containers: ${CONTAINERS.length} };\n`);
console.log(`rendered ${jobs.length} images, v=${v}`);
