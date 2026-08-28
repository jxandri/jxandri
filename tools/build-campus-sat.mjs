/**
 * build-campus-sat.mjs — the campus as it looks from orbit.
 *
 * Google's photorealistic 3D tiles need an API key and a billing account, so
 * they are not an option here and would not be redistributable in a file a
 * teacher hands out on a memory stick even if they were. The buildings the app
 * draws are therefore real Overture footprints with real heights, which is the
 * equivalent source; and this adds the other thing that was asked for as the
 * fallback — the actual satellite image, painted onto the ground.
 *
 * Sentinel-2 level 2A, ten metres a pixel, read by byte range straight out of
 * the cloud-optimised GeoTIFF on AWS Open Data. Nothing is downloaded but the
 * couple of hundred pixels the campus covers.
 *
 * Two details that matter for it to line up with the terrain:
 *
 *   The image is north-up in UTM and the window is a rectangle in longitude and
 *   latitude, and the two are not parallel — at this distance from the zone's
 *   central meridian the convergence is about 0.8°, which over two kilometres
 *   is thirty metres of skew, three pixels. So every output pixel is projected
 *   individually rather than the crop being lifted wholesale.
 *
 *   It is stored as JPEG. The crop is a photograph, and a photograph in PNG is
 *   six times the size for no visible gain in a texture that will be sampled
 *   per mesh vertex anyway.
 *
 * Usage:  node tools/build-campus-sat.mjs [--month 1] [--year 2025]
 * Writes: app/js/campus-sat.js
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fromUrl } from 'geotiff';
import jpeg from 'jpeg-js';

const here = dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------ the window */

// The union of the block first asked for and the quadrant named later, so one
// fit and one image serve both.
const LON_W = -(70 + 30 / 60 + 45 / 3600);      // 70°30′45″W
const LON_E = -(70 + 29 / 60 + 15 / 3600);      // 70°29′15″W
const LAT_S = -(33 + 25 / 60);                  // 33°25′S
const LAT_N = -(33 + 24 / 60);                  // 33°24′S

const ZONE = 19;

/** WGS84 lon/lat -> UTM easting/northing in metres. */
function utm(lon, lat, zone) {
  const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996;
  const e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const rad = Math.PI / 180;
  const lon0 = (zone * 6 - 183) * rad;
  const p = lat * rad, l = lon * rad;
  const N = a / Math.sqrt(1 - e2 * Math.sin(p) ** 2);
  const T = Math.tan(p) ** 2, C = ep2 * Math.cos(p) ** 2, A = (l - lon0) * Math.cos(p);
  const M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * p
    - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * p)
    + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * p)
    - (35 * e2 ** 3 / 3072) * Math.sin(6 * p));
  const E = k0 * N * (A + (1 - T + C) * A ** 3 / 6
    + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000;
  let Nn = k0 * (M + N * Math.tan(p) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24
    + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720));
  if (lat < 0) Nn += 10000000;
  return [E, Nn];
}

/* ------------------------------------------------------------- the scene */

const BASE = 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/';
const SQUARE = '19/H/CD';                 // the 100 km square holding Santiago

const args = process.argv.slice(2);
const YEAR = args.includes('--year') ? args[args.indexOf('--year') + 1] : '2025';
// Southern-hemisphere summer: no snow on the foot slope, and Santiago's dry
// season means a good chance of a cloudless pass.
const MONTHS = args.includes('--month')
  ? [args[args.indexOf('--month') + 1]]
  : ['1', '2', '12', '3', '11'];

async function scenes(month) {
  const prefix = `sentinel-s2-l2a-cogs/${SQUARE}/${YEAR}/${month}/`;
  const xml = await (await fetch(`${BASE}?list-type=2&delimiter=/&prefix=${encodeURIComponent(prefix)}`)).text();
  return [...xml.matchAll(/<Prefix>(.*?)<\/Prefix>/g)]
    .map((m) => m[1]).filter((p) => p !== prefix);
}

/** Cloud cover, straight from the scene's own metadata. */
async function cloud(scene) {
  const id = scene.replace(/\/$/, '').split('/').pop();
  try {
    const r = await fetch(`${BASE}${scene}${id}.json`);
    if (!r.ok) return null;
    const j = await r.json();
    return j?.properties?.['eo:cloud_cover'] ?? null;
  } catch { return null; }
}

console.log(`Looking for a clear pass over ${SQUARE} in ${YEAR}…`);
let best = null;
for (const month of MONTHS) {
  for (const s of await scenes(month)) {
    const c = await cloud(s);
    if (c === null) continue;
    console.log(`  ${s.split('/').slice(-2, -1)[0]}  ${c.toFixed(1)}% cloud`);
    if (!best || c < best.cloud) best = { scene: s, cloud: c, month };
    if (c < 0.5) break;
  }
  if (best && best.cloud < 0.5) break;
}
if (!best) throw new Error('no scene found');
console.log(`  chosen: ${best.scene.split('/').slice(-2, -1)[0]} at ${best.cloud.toFixed(1)}% cloud`);

/* --------------------------------------------------------------- the crop */

const sceneId = best.scene.replace(/\/$/, '').split('/').pop();
const tif = await fromUrl(`${BASE}${best.scene}TCI.tif`);
const img = await tif.getImage();
const [bx0, by0, bx1, by1] = img.getBoundingBox();
const W = img.getWidth(), H = img.getHeight();
const res = (bx1 - bx0) / W;                   // 10 m
console.log(`  TCI ${W}x${H} at ${res} m, bbox ${bx0} ${by0} ${bx1} ${by1}`);

// The pixel window that covers the lon/lat rectangle, with a margin for skew.
const corners = [[LON_W, LAT_S], [LON_W, LAT_N], [LON_E, LAT_S], [LON_E, LAT_N]]
  .map(([lo, la]) => utm(lo, la, ZONE));
const pad = 6;
const i0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => (c[0] - bx0) / res)) - pad));
const i1 = Math.min(W, Math.ceil(Math.max(...corners.map((c) => (c[0] - bx0) / res)) + pad));
const j0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => (by1 - c[1]) / res)) - pad));
const j1 = Math.min(H, Math.ceil(Math.max(...corners.map((c) => (by1 - c[1]) / res)) + pad));
const cw = i1 - i0, ch = j1 - j0;
console.log(`  reading ${cw}x${ch} pixels`);

const raster = await img.readRasters({ window: [i0, j0, i1, j1] });
const [R, G, B] = raster;                       // TCI is three 8-bit bands

/* --------------------------------------------------- onto the lon/lat grid */

// Ten metres an output pixel, which is the source resolution: finer would be
// interpolation dressed up as detail.
const NX = Math.round(((LON_E - LON_W) * 111.320 * Math.cos((LAT_S + LAT_N) / 2 * Math.PI / 180) * 1000) / 10);
const NY = Math.round(((LAT_N - LAT_S) * 110.574 * 1000) / 10);
console.log(`  resampling to ${NX}x${NY}`);

const out = Buffer.alloc(NX * NY * 4);
let clipped = 0;
for (let jy = 0; jy < NY; jy++) {
  // Row 0 is the north edge, so the raster reads the way an image does.
  const lat = LAT_N - ((jy + 0.5) / NY) * (LAT_N - LAT_S);
  for (let ix = 0; ix < NX; ix++) {
    const lon = LON_W + ((ix + 0.5) / NX) * (LON_E - LON_W);
    const [E, N] = utm(lon, lat, ZONE);
    const fx = (E - bx0) / res - i0 - 0.5;
    const fy = (by1 - N) / res - j0 - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const at = (x, y, band) => {
      const cx = Math.max(0, Math.min(cw - 1, x)), cy = Math.max(0, Math.min(ch - 1, y));
      if (cx !== x || cy !== y) clipped++;
      return band[cy * cw + cx];
    };
    const mix = (band) => at(x0, y0, band) * (1 - tx) * (1 - ty)
      + at(x0 + 1, y0, band) * tx * (1 - ty)
      + at(x0, y0 + 1, band) * (1 - tx) * ty
      + at(x0 + 1, y0 + 1, band) * tx * ty;
    const k = (jy * NX + ix) * 4;
    // Sentinel's true-colour product is deliberately flat so that nothing
    // clips; a gentle lift makes it read as ground rather than as haze without
    // inventing anything that is not in the pixel.
    const lift = (v) => Math.max(0, Math.min(255, Math.round(6 + v * 1.22)));
    out[k] = lift(mix(R)); out[k + 1] = lift(mix(G)); out[k + 2] = lift(mix(B));
    out[k + 3] = 255;
  }
}
if (clipped) console.log(`  ${clipped} samples fell on the crop edge (clamped)`);

const enc = jpeg.encode({ data: out, width: NX, height: NY }, 82);
const uri = `data:image/jpeg;base64,${enc.data.toString('base64')}`;
console.log(`  JPEG ${(enc.data.length / 1024).toFixed(1)} KB`);

const round = (v, d) => Number(v.toFixed(d));
writeFileSync(join(here, '..', 'app', 'js', 'campus-sat.js'), `/**
 * campus-sat.js — the Universidad de los Andes from orbit. GENERATED by
 * tools/build-campus-sat.mjs; do not edit by hand.
 *
 * Sentinel-2 L2A true colour, 10 m a pixel, scene
 * ${sceneId} at ${best.cloud.toFixed(1)}% cloud.
 * Copernicus Sentinel data, processed by ESA; free to use with attribution.
 *
 * The image is stored north-up on the same longitude/latitude rectangle the
 * surface is fitted over, already resampled out of UTM, so a point of the
 * domain maps to a pixel by a straight linear map with no projection left to
 * do at run time.
 */
export const SAT = {
  west: ${round(LON_W, 7)}, east: ${round(LON_E, 7)},
  south: ${round(LAT_S, 7)}, north: ${round(LAT_N, 7)},
  nx: ${NX}, ny: ${NY},
  scene: ${JSON.stringify(sceneId)},
  cloud: ${round(best.cloud, 1)},
  credit: 'Copernicus Sentinel-2 (ESA)',
  src: '${uri}',
};
`, 'utf8');
console.log(`\napp/js/campus-sat.js written`);
