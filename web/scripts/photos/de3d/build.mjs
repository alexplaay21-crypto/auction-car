// Итог: рендер → игровая карточка web/public/art/car-<id>.jpg, манифесты и авторы 3D-моделей.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { GERMAN } from '/home/user/auction-car/tgcloud/lib/catalog_de.js';
import { germanIds } from '/home/user/auction-car/tgcloud/lib/ddl8.js';
const meta = JSON.parse(readFileSync('meta.json'));
const masks = JSON.parse(readFileSync('masks.json'));
const ids = germanIds(); const ART = '/home/user/auction-car/web/public/art';
const photos = {}, credits = [];
for (let k = 0; k < GERMAN.length; k++) {
  const out = `${ART}/car-${ids[k]}.jpg`;
  execFileSync('../imgenv/bin/python', ['comp.py', `r/${k}.png`, GERMAN[k][2], out, JSON.stringify(masks[k] ?? [])]);
  photos[ids[k]] = createHash('md5').update(readFileSync(out)).digest('hex').slice(0, 8);
  const m = meta[k]; credits.push({ car: GERMAN[k][0], author: m.author, license: m.license, page: m.page });
}
writeFileSync('/home/user/auction-car/web/src/photos.ts', `// Создано сборкой графики: машины, отрисованные по 3D-моделям (id → версия файла).\nexport const PHOTOS: Record<number, string> = ${JSON.stringify(photos)};\nexport const CREDITS: { car: string; author: string; license: string; page: string }[] = ${JSON.stringify(credits, null, 1)};\n`);
writeFileSync('/home/user/auction-car/tgcloud/lib/photo_manifest.js', `// Создано сборкой графики: машины, отрисованные по 3D-моделям (id → версия файла).\nexport const PHOTOS = ${JSON.stringify(photos)};\n`);
console.log('built', Object.keys(photos).length);
