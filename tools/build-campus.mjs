/**
 * build-campus.mjs — bake a real, inhabited square kilometre into the bundle.
 *
 * Every other surface in this program is either a formula or an empty mountain.
 * This one is a place people go to work: the Universidad de los Andes campus in
 * San Carlos de Apoquindo, on the Andean foot slope at the eastern edge of
 * Santiago, between 70°30′40″W and 70°29′15″W and between 33°24′S and 33°25′S.
 *
 * Three public sources, three different kinds of truth, in the same local
 * kilometre grid:
 *
 *   the ground        AWS Open Data terrarium tiles (SRTM/NASADEM lineage),
 *                     fitted to a finite cosine series so that the surface a
 *                     student walks on is infinitely differentiable — see
 *                     elias.js for why that matters and what it costs;
 *
 *   the vegetation    ESA WorldCover 2021 v200, 10 m land cover, read straight
 *                     out of the cloud-optimised GeoTIFF by byte range. Trees
 *                     are planted where there are trees, scrub where there is
 *                     scrub, and nothing on the tarmac;
 *
 *   the buildings     Overture Maps building footprints, read by byte range out
 *                     of the GeoParquet release using the row-group bounding
 *                     boxes to fetch only the two row groups that touch the
 *                     campus. Real outlines, real heights where the source has
 *                     them.
 *
 * The point of the example is not the scenery. A student who has spent a term
 * maximising invented functions over invented budget sets gets to stand in a
 * place they recognise and ask the same questions of it: what is the gradient
 * at the library door, which way is downhill from the lecture theatre, what
 * does a level curve of altitude look like when it runs through a car park.
 *
 * Usage:  node tools/build-campus.mjs
 * Writes: app/js/campus-data.js
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';
import { fromUrl } from 'geotiff';
import { parquetMetadataAsync, parquetReadObjects } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';

const here = dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------ the window */

// The rectangle the request names, to the second.
const LON_W = -(70 + 30 / 60 + 40 / 3600);      // 70°30′40″W
const LON_E = -(70 + 29 / 60 + 15 / 3600);      // 70°29′15″W
const LAT_S = -(33 + 25 / 60);                  // 33°25′S
const LAT_N = -(33 + 24 / 60);                  // 33°24′S

const KY = 110.574;                              // km per degree of latitude
const kxAt = (lat) => 111.320 * Math.cos((lat * Math.PI) / 180);

const lat0 = (LAT_S + LAT_N) / 2;
const lon0 = (LON_W + LON_E) / 2;
const KX = kxAt(lat0);
const halfX = ((LON_E - LON_W) / 2) * KX;        // km east–west
const halfY = ((LAT_N - LAT_S) / 2) * KY;        // km north–south

/* ------------------------------------------------------- elevation tiles */

const TILE_DIR = process.env.BORDER_TILE_CACHE || join(here, '..', '.tilecache');
mkdirSync(TILE_DIR, { recursive: true });
const cache = new Map();

function tileXY(lon, lat, z) {
  const n = 2 ** z;
  const xr = ((lon + 180) / 360) * n;
  const rad = (lat * Math.PI) / 180;
  const yr = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  return [xr, yr];
}

async function tile(z, tx, ty) {
  const key = `${z}/${tx}/${ty}`;
  if (cache.has(key)) return cache.get(key);
  const disk = join(TILE_DIR, `${z}_${tx}_${ty}.png`);
  if (existsSync(disk)) {
    const png = PNG.sync.read(readFileSync(disk));
    cache.set(key, png);
    return png;
  }
  const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${tx}/${ty}.png`;
  let last;
  for (let a = 0; a < 5; a++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      const bytes = Buffer.from(await res.arrayBuffer());
      writeFileSync(disk, bytes);
      const png = PNG.sync.read(bytes);
      cache.set(key, png);
      return png;
    } catch (e) { last = e; await new Promise((r) => setTimeout(r, 400 * 2 ** a)); }
  }
  throw new Error(`${url} -> ${last.message}`);
}

async function elevation(z, lon, lat) {
  const [xr, yr] = tileXY(lon, lat, z);
  const px = xr * 256, py = yr * 256;
  const x0 = Math.floor(px - 0.5), y0 = Math.floor(py - 0.5);
  const fx = px - 0.5 - x0, fy = py - 0.5 - y0;
  const at = async (gx, gy) => {
    const png = await tile(z, Math.floor(gx / 256), Math.floor(gy / 256));
    const i = ((gy - Math.floor(gy / 256) * 256) * 256 + (gx - Math.floor(gx / 256) * 256)) * 4;
    const d = png.data;
    return d[i] * 256 + d[i + 1] + d[i + 2] / 256 - 32768;
  };
  const h00 = await at(x0, y0), h10 = await at(x0 + 1, y0);
  const h01 = await at(x0, y0 + 1), h11 = await at(x0 + 1, y0 + 1);
  return h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy)
    + h01 * (1 - fx) * fy + h11 * fx * fy;
}

/* ---------------------------------------------------- the smooth surface */

function dct1(vec) {
  const N = vec.length, out = new Float64Array(N);
  for (let j = 0; j < N; j++) {
    let s = 0.5 * (vec[0] + (j % 2 ? -1 : 1) * vec[N - 1]);
    for (let i = 1; i < N - 1; i++) s += vec[i] * Math.cos(Math.PI * j * i / (N - 1));
    out[j] = (2 / (N - 1)) * s;
  }
  return out;
}

function analyse(H, N) {
  const rows = new Array(N);
  for (let j = 0; j < N; j++) rows[j] = dct1(H.subarray(j * N, (j + 1) * N));
  const cols = new Array(N);
  const col = new Float64Array(N);
  for (let j = 0; j < N; j++) {
    for (let k = 0; k < N; k++) col[k] = rows[k][j];
    cols[j] = dct1(col);
  }
  return cols;
}

function truncate(cols, M, sigma) {
  const c = new Float64Array(M * M);
  for (let j = 0; j < M; j++) {
    for (let k = 0; k < M; k++) {
      const w = Math.exp(-(j * j + k * k) / (2 * sigma * sigma));
      c[k * M + j] = cols[j][k] * w * (j === 0 ? 0.5 : 1) * (k === 0 ? 0.5 : 1);
    }
  }
  return c;
}

/**
 * The series, on a rectangular window.
 *
 * The mountains are square and could get away with one half-width; a city block
 * is not, so each axis carries its own. The index space the transform lives in
 * is square either way — it is the map from kilometres into it that differs —
 * which is why the coefficients are unchanged and only the substitution moves.
 */
function evaluator(c, M, hx, hy) {
  const cj = new Float64Array(M), ck = new Float64Array(M);
  return (x, y) => {
    const tx = Math.PI * (x + hx) / (2 * hx), ty = Math.PI * (y + hy) / (2 * hy);
    cj[0] = 1; ck[0] = 1;
    if (M > 1) { cj[1] = Math.cos(tx); ck[1] = Math.cos(ty); }
    for (let n = 2; n < M; n++) {
      cj[n] = 2 * cj[1] * cj[n - 1] - cj[n - 2];
      ck[n] = 2 * ck[1] * ck[n - 1] - ck[n - 2];
    }
    let v = 0;
    for (let k = 0; k < M; k++) {
      let r = 0;
      for (let j = 0; j < M; j++) r += c[k * M + j] * cj[j];
      v += r * ck[k];
    }
    return v;
  };
}

/* ---------------------------------------------------------- the encoding */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const QUANTUM = 0.02;                            // metres per coefficient step

/** Zigzag base-64 varints — the same scheme the coastline and the peaks use. */
function varints(nums) {
  const out = [];
  for (const n of nums) {
    let z = n < 0 ? -n * 2 - 1 : n * 2;
    while (z >= 32) { out.push(ALPHABET[(z & 31) | 32]); z = Math.floor(z / 32); }
    out.push(ALPHABET[z]);
  }
  return out.join('');
}

const encodeCoeffs = (c) => varints([...c].map((v) => Math.round(v / QUANTUM)));

/* ---------------------------------------------------------- land  cover */

const WORLDCOVER = 'https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/'
  + 'ESA_WorldCover_10m_2021_v200_S36W072_Map.tif';

// The classes ESA uses, in the order this file stores them. Index 0 is "no
// data", which never appears over land here but keeps the arithmetic honest.
const COVER = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100];

/** The 10 m land-cover grid over the window, as class indices. */
async function landCover() {
  const tif = await fromUrl(WORLDCOVER);
  const img = await tif.getImage();
  const [bx0, by0, bx1, by1] = img.getBoundingBox();
  const W = img.getWidth(), H = img.getHeight();
  const px = (bx1 - bx0) / W, py = (by1 - by0) / H;

  // Pixel window, inclusive of anything the rectangle touches.
  const i0 = Math.floor((LON_W - bx0) / px), i1 = Math.ceil((LON_E - bx0) / px);
  const j0 = Math.floor((by1 - LAT_N) / py), j1 = Math.ceil((by1 - LAT_S) / py);
  const raster = await img.readRasters({ window: [i0, j0, i1, j1], interleave: true });
  const nx = i1 - i0, ny = j1 - j0;

  const idx = new Uint8Array(nx * ny);
  for (let k = 0; k < nx * ny; k++) {
    const v = raster[k];
    const at = COVER.indexOf(v);
    idx[k] = at < 0 ? 0 : at;
  }
  // The geographic extent of the pixels actually taken, so the app can map a
  // kilometre back to a cell without re-deriving the tile's grid.
  return {
    nx, ny, idx,
    west: bx0 + i0 * px, north: by1 - j0 * py, px, py,
  };
}

/** Run-length: (class, count) pairs, count as a varint. Cities are blocky. */
function encodeCover(idx) {
  const runs = [];
  let run = 1;
  for (let i = 1; i <= idx.length; i++) {
    if (i < idx.length && idx[i] === idx[i - 1]) { run++; continue; }
    runs.push(idx[i - 1], run);
    run = 1;
  }
  return varints(runs);
}

/* ----------------------------------------------------------- buildings */

const OVERTURE = 'https://overturemaps-us-west-2.s3.amazonaws.com/';

async function remoteBuffer(url) {
  const size = Number((await fetch(url, { method: 'HEAD' })).headers.get('content-length'));
  return {
    byteLength: size,
    async slice(a, b) {
      const r = await fetch(url, { headers: { Range: `bytes=${a}-${(b ?? size) - 1}` } });
      return r.arrayBuffer();
    },
  };
}

/**
 * Building outlines over the window.
 *
 * The release is 277 GB in 512 files and none of it is downloaded. Parquet
 * keeps per-row-group statistics, and Overture stores a bounding box as four
 * plain columns, so the footers alone say which row groups can possibly touch
 * the campus — it turns out to be two of about 130,000 — and only those are
 * read. That is the whole reason this is buildable inside a sandbox.
 */
async function buildings() {
  const prefix = 'release/2026-08-19.0/theme=buildings/type=building/';
  const listing = await (await fetch(`${OVERTURE}?list-type=2&prefix=${encodeURIComponent(prefix)}`)).text();
  const keys = [...listing.matchAll(/<Key>(.*?)<\/Key>/g)]
    .map((m) => m[1]).filter((k) => k.endsWith('.parquet'));
  if (!keys.length) throw new Error('no building files listed');
  console.log(`  ${keys.length} building files in the release`);

  const stat = (rg, name) => rg.columns
    .find((c) => c.meta_data.path_in_schema.join('.') === name)?.meta_data?.statistics;

  const hits = [];
  const queue = [...keys];
  let scanned = 0;
  await Promise.all(Array.from({ length: 10 }, async () => {
    for (;;) {
      const key = queue.shift();
      if (!key) return;
      const url = OVERTURE + key;
      const md = await parquetMetadataAsync(await remoteBuffer(url));
      let row = 0;
      for (const rg of md.row_groups) {
        const n = Number(rg.num_rows);
        const xa = stat(rg, 'bbox.xmin'), xb = stat(rg, 'bbox.xmax');
        const ya = stat(rg, 'bbox.ymin'), yb = stat(rg, 'bbox.ymax');
        if (xa && xb && ya && yb
          && xb.max >= LON_W && xa.min <= LON_E && yb.max >= LAT_S && ya.min <= LAT_N) {
          hits.push({ url, rowStart: row, rowEnd: row + n });
        }
        row += n;
      }
      if (++scanned % 100 === 0) console.log(`  scanned ${scanned}, ${hits.length} row groups`);
    }
  }));
  console.log(`  ${hits.length} row group(s) touch the campus`);

  const out = [];
  for (const h of hits) {
    const file = await remoteBuffer(h.url);
    const rows = await parquetReadObjects({
      file, compressors,
      columns: ['bbox', 'geometry', 'height', 'num_floors', 'class', 'subtype'],
      rowStart: h.rowStart, rowEnd: h.rowEnd,
    });
    for (const r of rows) {
      const b = r.bbox;
      if (!b || b.xmax < LON_W || b.xmin > LON_E || b.ymax < LAT_S || b.ymin > LAT_N) continue;
      const g = r.geometry;
      if (!g) continue;
      // hyparquet hands GeoParquet back as GeoJSON already.
      const parts = g.type === 'Polygon' ? [g.coordinates]
        : g.type === 'MultiPolygon' ? g.coordinates : null;
      if (!parts) continue;
      for (const rings of parts) {
        const ring = rings[0];
        if (!ring || ring.length < 4) continue;
        out.push({
          ring: ring.map(([lon, lat]) => [(lon - lon0) * KX, (lat - lat0) * KY]),
          height: r.height ?? null,
          floors: r.num_floors ?? null,
          cls: r.class ?? null,
        });
      }
    }
  }
  return out;
}

/** Perpendicular-distance simplification, in kilometres. */
function simplify(pts, tol) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1; keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let far = -1, best = tol;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1e-12;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len;
      if (d > best) { best = d; far = i; }
    }
    if (far > 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/* ----------------------------------------------------------------- run */

console.log(`Universidad de los Andes — ${(2 * halfX).toFixed(3)} x ${(2 * halfY).toFixed(3)} km`
  + ` centred on ${lat0.toFixed(5)}, ${lon0.toFixed(5)}`);

/* --- the ground ------------------------------------------------------- */

const N = 257;
// One elevation sample about every eight metres across, which is as fine as
// the source model can honestly be read at this latitude.
const stepX = (2 * halfX) / (N - 1), stepY = (2 * halfY) / (N - 1);
const z = Math.max(8, Math.min(14, Math.round(
  Math.log2((156543.03 * Math.cos((lat0 * Math.PI) / 180)) / ((stepX * 1000) / 2)))));
console.log(`  DEM z${z}, ${N}x${N} @ ${(stepX * 1000).toFixed(0)} x ${(stepY * 1000).toFixed(0)} m`);

const H = new Float64Array(N * N);
for (let j = 0; j < N; j++) {
  const lat = lat0 + (-halfY + j * stepY) / KY;
  for (let i = 0; i < N; i++) {
    H[j * N + i] = await elevation(z, lon0 + (-halfX + i * stepX) / KX, lat);
  }
}
let lo = Infinity, hi = -Infinity;
for (const v of H) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
console.log(`  ground ${lo.toFixed(0)}–${hi.toFixed(0)} m, relief ${(hi - lo).toFixed(0)} m`);

const cols = analyse(H, N);

// How sharp a fit the source can carry.
//
// The elevation model here descends from 30 m posts, so about seventy real
// samples span the window. A series with M modes resolves down to 2*width/M,
// and asking for detail finer than the data has invents ridges. The ladder
// stops where the finest mode is still comfortably coarser than a source post,
// and among the fits that qualify the sharpest one wins — the same rule the
// mountains use, for the same reason.
const SOURCE_POST = 0.030;                       // km
let chosen = null;
for (const [M, sigma] of [[16, 5], [20, 6], [24, 7], [28, 8], [32, 9], [40, 11], [48, 13]]) {
  if ((2 * halfX) / M < SOURCE_POST * 1.6) break;
  const c = truncate(cols, M, sigma);
  const f = evaluator(c, M, halfX, halfY);
  let se = 0, n = 0;
  for (let j = 0; j < N; j += 2) {
    for (let i = 0; i < N; i += 2) {
      const e = f(-halfX + i * stepX, -halfY + j * stepY) - H[j * N + i];
      se += e * e; n++;
    }
  }
  const rms = Math.sqrt(se / n);
  console.log(`    M=${M} sigma=${sigma}: rms ${rms.toFixed(1)} m,`
    + ` finest mode ${((2 * halfX * 1000) / M).toFixed(0)} m`);
  chosen = { M, sigma, c, rms };
}
if (!chosen) throw new Error('no admissible fit');
console.log(`  chosen M=${chosen.M}, rms ${chosen.rms.toFixed(1)} m`);

/* --- the vegetation --------------------------------------------------- */

console.log('  ESA WorldCover 10 m…');
const cover = await landCover();
const tally = {};
for (const v of cover.idx) tally[COVER[v]] = (tally[COVER[v]] || 0) + 1;
const NAMES = {
  0: 'no data', 10: 'tree cover', 20: 'shrubland', 30: 'grassland', 40: 'cropland',
  50: 'built-up', 60: 'bare / sparse', 70: 'snow & ice', 80: 'water',
  90: 'wetland', 95: 'mangrove', 100: 'moss & lichen',
};
console.log(`  ${cover.nx}x${cover.ny} cells: ` + Object.entries(tally)
  .sort((a, b) => b[1] - a[1])
  .map(([k, n]) => `${NAMES[k]} ${((100 * n) / cover.idx.length).toFixed(0)}%`).join(', '));
const coverData = encodeCover(cover.idx);

/* --- the buildings ---------------------------------------------------- */

console.log('  Overture buildings…');
const raw = await buildings();
console.log(`  ${raw.length} footprints in the window`);

// Outlines to a quarter of a metre, which is finer than the sources are and
// well below anything visible at the scale a person is drawn.
const STEP = 0.00025;                            // km per coordinate step
const kept = [];
for (const b of raw) {
  let ring = b.ring;
  // GeoJSON closes its rings; the renderer does not need the repeat.
  if (ring.length > 1) {
    const [ax, ay] = ring[0], [bx, by] = ring[ring.length - 1];
    if (Math.hypot(ax - bx, ay - by) < 1e-9) ring = ring.slice(0, -1);
  }
  ring = simplify(ring, 0.0008);
  if (ring.length < 3) continue;
  // Area, to drop the sheds that would be noise at this scale.
  let a2 = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length];
    a2 += x1 * y2 - x2 * y1;
  }
  const area = Math.abs(a2) / 2 * 1e6;           // m²
  if (area < 12) continue;
  // Height: what the source says, else three metres a floor, else inferred
  // from the footprint.
  //
  // Overture states a height for twelve of these fifteen hundred, which is
  // normal outside the cities that have lidar. Rather than stamping one
  // default on the whole neighbourhood — which draws a suburb as a car park
  // with kerbs — the fallback reads the plan area, because in a low-rise
  // Santiago suburb it correlates with what the building is: a hundred square
  // metres is a house, four hundred is a block of flats or a school wing, two
  // thousand is a sports hall or a faculty building. It is an inference and it
  // is labelled as one; the app never claims these are surveyed heights.
  const h = b.height != null ? b.height
    : b.floors != null ? b.floors * 3.1
      : area < 90 ? 4.2
        : area < 220 ? 5.6
          : area < 700 ? 8.0
            : area < 2000 ? 11.0
              : 14.0;
  kept.push({ ring, h: Math.max(2.2, Math.min(90, h)), stated: b.height != null || b.floors != null });
}
kept.sort((a, b) => b.ring.length - a.ring.length);
console.log(`  ${kept.length} kept, ${kept.filter((b) => b.stated).length} with a stated height`);

// One varint stream: per building, the vertex count, the height in decimetres,
// then the ring as deltas from the previous vertex in quarter-metre steps.
const stream = [];
for (const b of kept) {
  stream.push(b.ring.length, Math.round(b.h * 10));
  let px = 0, py = 0;
  for (const [x, y] of b.ring) {
    const qx = Math.round(x / STEP), qy = Math.round(y / STEP);
    stream.push(qx - px, qy - py);
    px = qx; py = qy;
  }
}
const buildingData = varints(stream);

/* --- emit ------------------------------------------------------------- */

const round = (v, d = 5) => {
  const r = Number(v.toFixed(d));
  return Object.is(r, -0) ? 0 : r;
};

const out = `/**
 * campus-data.js — Universidad de los Andes, San Carlos de Apoquindo, Santiago.
 * GENERATED by tools/build-campus.mjs; do not edit by hand.
 *
 * The window is 70°30′40″W–70°29′15″W by 33°25′S–33°24′S, in local kilometres
 * east and north of its centre.
 *
 *   d      the ground: ${chosen.M}x${chosen.M} tapered DCT coefficients, quantised to ${QUANTUM} m,
 *          as zigzag base-64 varints. Elevation in metres.
 *   cover  ESA WorldCover 2021 v200 land cover at 10 m, run-length encoded as
 *          (class index, run) pairs over a west-to-east, north-to-south raster.
 *   b      Overture building footprints: per building the vertex count, the
 *          height in decimetres, then the outline as deltas in ${STEP * 1000} m steps.
 *
 * Sources: AWS Open Data terrarium tiles; ESA WorldCover (CC BY 4.0);
 * Overture Maps Foundation (ODbL / CDLA-Permissive-2.0 per source).
 */
export const QUANTUM = ${QUANTUM};
export const COVER_CLASSES = ${JSON.stringify(COVER)};
export const CAMPUS = {
  M: ${chosen.M}, sigma: ${chosen.sigma},
  lat: ${round(lat0)}, lon: ${round(lon0)},
  halfX: ${round(halfX, 6)}, halfY: ${round(halfY, 6)},
  west: ${round(LON_W, 6)}, east: ${round(LON_E, 6)},
  south: ${round(LAT_S, 6)}, north: ${round(LAT_N, 6)},
  ground: { low: ${round(lo, 1)}, high: ${round(hi, 1)} },
  rms: ${round(chosen.rms, 2)},
  cover: { nx: ${cover.nx}, ny: ${cover.ny},
    west: ${round(cover.west, 7)}, north: ${round(cover.north, 7)},
    px: ${round(cover.px, 9)}, py: ${round(cover.py, 9)} },
  buildings: ${kept.length},
  step: ${STEP},
  d: '${encodeCoeffs(chosen.c)}',
  cv: '${coverData}',
  b: '${buildingData}',
};
`;

const dest = join(here, '..', 'app', 'js', 'campus-data.js');
writeFileSync(dest, out);
console.log(`\n${dest}  ${(out.length / 1024).toFixed(0)} KB`
  + ` (surface ${(encodeCoeffs(chosen.c).length / 1024).toFixed(1)},`
  + ` cover ${(coverData.length / 1024).toFixed(1)},`
  + ` buildings ${(buildingData.length / 1024).toFixed(1)})`);
