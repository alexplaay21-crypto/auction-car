// Рендер GLB-модели в PNG с прозрачным фоном: node render.mjs <in.glb> <out.png> [yaw]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('/opt/node-tools/node_modules/playwright/index.js');
import { readFileSync } from 'node:fs';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const jobs = JSON.parse(process.argv[2]); // [[glb, out, yaw], ...]
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('PAGEERR', e.message));
await page.route('http://r/**', async (route) => {
  const u = new URL(route.request().url()).pathname;
  const f = u.startsWith('/three/') ? path.join(here, 'node_modules', u) : u.startsWith('/m/') ? decodeURIComponent(u.slice(2)) : path.join(here, u);
  const type = f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : f.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream';
  try { await route.fulfill({ body: readFileSync(f), contentType: type }); } catch { await route.fulfill({ status: 404, body: '' }); }
});
await page.goto('http://r/page.html'); await page.waitForFunction(() => window.ready, null, { timeout: 60000 });
for (const [glb, out, yaw, opt] of jobs) {
  const t = Date.now();
  try {
    await page.evaluate(() => { const s = window.__s; }); 
    const r = await page.evaluate(([u, y, o]) => window.renderCar(u, y, o), ['http://r/m/' + encodeURIComponent(glb), yaw ?? 0, opt ?? {}]);
    await page.locator('canvas').screenshot({ path: out, omitBackground: true });
    console.log('ok', out, r.size.map((x) => x.toFixed(2)).join('x'), 'painted', r.painted, Date.now() - t, 'ms');
  } catch (e) { console.log('fail', glb, String(e.message).slice(0, 200)); }
  await page.reload(); await page.waitForFunction(() => window.ready);
}
await b.close();
