/**
 * build-atlas-photos.mjs — the aerial photographs, small enough to carry.
 *
 * Each border mountain shows a photograph in the corner of the screen, with the
 * international boundary drawn across it as a thick red corridor. The pictures
 * come from the atlas PDF, which embeds them as full-page JPEGs — a megabyte
 * apiece, twenty megabytes in all, which is not something to put inside a file
 * a teacher emails to a class.
 *
 * So they are re-encoded: downscaled to corner-panel size and written as WebP,
 * which at this size is roughly half the bytes of JPEG for the same look.
 * Chromium does the encoding — it is already here for the screenshot tests, it
 * has the best WebP encoder available without adding a dependency, and using a
 * browser to write a picture a browser will display avoids a whole class of
 * colour-profile surprise.
 *
 * Identical photographs are stored once. The atlas openly reuses a few images
 * as regional context — the North Cascades panorama stands in for several
 * peaks, and the atlas says so in its captions — so the same bytes would
 * otherwise be embedded three or four times over. Those entries also carry
 * `ofItself: false` in the catalogue, and the caption in the app says
 * "regional view" rather than naming the mountain, because a photograph
 * labelled as something it is not is worse than no photograph.
 *
 *   node tools/build-atlas-photos.mjs path/to/atlas.pdf
 */

import { writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright-core';
import { CATALOGUE } from './atlas-catalogue.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const pdfPath = process.argv[2];
if (!pdfPath) { console.error('usage: node tools/build-atlas-photos.mjs atlas.pdf'); process.exit(2); }

const WIDTH = 420;          // corner panel, at 2x for sharp text-height screens
const QUALITY = 0.72;

/* ------------------------------------------- pull the JPEGs out of the PDF */

const buf = readFileSync(pdfPath);
const s = buf.toString('latin1');
const images = new Map();                       // object number -> JPEG bytes
{
  const re = /(\d+)\s+(\d+)\s+obj\b/g;
  let m;
  while ((m = re.exec(s))) {
    const streamAt = s.indexOf('stream', m.index);
    if (streamAt < 0) continue;
    const dict = s.slice(m.index, streamAt);
    if (!/\/Subtype\s*\/Image/.test(dict)) continue;
    if (!/\/Filter\s*\/DCTDecode/.test(dict)) continue;
    let p = streamAt + 6;
    if (s[p] === '\r') p++;
    if (s[p] === '\n') p++;
    const len = Number((dict.match(/\/Length\s+(\d+)/) || [])[1]);
    if (!len) continue;
    images.set(Number(m[1]), buf.subarray(p, p + len));
  }
}
console.log(`${images.size} JPEGs in the PDF`);

/* --------------------------------------------------- re-encode in Chromium */

const tmp = join(here, '..', '.photocache');
mkdirSync(tmp, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();

const byHash = new Map();                       // sha1 -> { key, dataUri }
const perMountain = [];
let rawTotal = 0, outTotal = 0;

for (const entry of CATALOGUE) {
  const jpeg = images.get(entry.photo);
  if (!jpeg) { console.error(`!! ${entry.id}: no image object ${entry.photo}`); process.exit(1); }
  rawTotal += jpeg.length;

  const hash = createHash('sha1').update(jpeg).digest('hex').slice(0, 12);
  if (byHash.has(hash)) {
    perMountain.push({ id: entry.id, key: byHash.get(hash).key, shared: true });
    console.log(`  ${entry.id.padEnd(12)} shares ${byHash.get(hash).key}`);
    continue;
  }

  const file = join(tmp, `${hash}.jpg`);
  writeFileSync(file, jpeg);
  const dataUri = await page.evaluate(async ({ src, width, quality }) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
    const scale = Math.min(1, width / img.naturalWidth);
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/webp', quality);
  }, {
    src: `data:image/jpeg;base64,${jpeg.toString('base64')}`,
    width: WIDTH, quality: QUALITY,
  });

  const key = entry.id;
  byHash.set(hash, { key, dataUri });
  outTotal += dataUri.length;
  perMountain.push({ id: entry.id, key, dataUri });
  console.log(`  ${entry.id.padEnd(12)} ${(jpeg.length / 1024).toFixed(0)} KB ->`
    + ` ${(dataUri.length / 1024).toFixed(1)} KB`);
}

await browser.close();
rmSync(tmp, { recursive: true, force: true });

/* ---------------------------------------------------------------- emit */

const unique = [...byHash.values()];
const body = unique.map((u) => `  ${JSON.stringify(u.key)}: '${u.dataUri}',`).join('\n');
const alias = perMountain.filter((p) => p.shared)
  .map((p) => `  ${JSON.stringify(p.id)}: ${JSON.stringify(p.key)},`).join('\n');

const out = `/**
 * borders-photos.js — aerial photographs of the border mountains, as data URIs.
 * GENERATED by tools/build-atlas-photos.mjs from the atlas PDF; do not edit.
 *
 * ${unique.length} unique pictures for ${CATALOGUE.length} mountains — the atlas reuses a few as
 * regional context and says so, and ALIAS records which mountain borrows which.
 * The red corridor across each frame is the atlas's own annotation: a schematic
 * projection of the international boundary, deliberately far wider than the
 * real thing so that it reads at this size.
 */
export const PHOTOS = {
${body}
};

/** Mountains that borrow another entry's photograph. */
export const ALIAS = {
${alias}
};

export const photoFor = (id) => PHOTOS[ALIAS[id] || id] || null;
`;

const dest = join(here, '..', 'app', 'js', 'borders-photos.js');
writeFileSync(dest, out);
console.log(`\n${(rawTotal / 1024 / 1024).toFixed(1)} MB of source JPEG -> `
  + `${(outTotal / 1024).toFixed(0)} KB of WebP in ${unique.length} unique images`);
console.log(`${dest}  ${(out.length / 1024).toFixed(0)} KB`);
