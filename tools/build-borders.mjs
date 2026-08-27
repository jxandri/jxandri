/**
 * build-borders.mjs — bake the border-mountain atlas into the bundle.
 *
 * For every mountain in atlas-catalogue.mjs this fetches the public-domain
 * elevation model around the summit, checks that the peak it finds really is
 * the mountain the atlas names, projects the international boundary into the
 * same local kilometre grid, fits an infinitely differentiable surface to the
 * terrain, and writes the result out as coefficients the program carries with
 * it. No network at run time, and no elevation grid either — what ships is a
 * finite sum of cosines per mountain.
 *
 * Two modes:
 *
 *   node tools/build-borders.mjs --probe [id ...]
 *       Fetch and report only: where the summit is, how high, how far from the
 *       frontier, and whether that agrees with the atlas. Nothing is written.
 *       This is the step that catches a seed coordinate pointing at the wrong
 *       peak — in the North Cascades half a dozen border peaks stand within a
 *       few kilometres of each other, and the highest point near a bad seed is
 *       simply a different mountain.
 *
 *   node tools/build-borders.mjs [id ...]
 *       The full build: writes app/js/borders-data.js.
 *
 * The acceptance tests each mountain must pass
 * --------------------------------------------
 *   1. The summit found in the elevation model is within `seekKm` of the seed
 *      and within 6% of the elevation the atlas states. A mountain that fails
 *      this is not the mountain we meant.
 *   2. The summit is on the side of the boundary the atlas says it is on.
 *   3. After smoothing, it is *still* on that side, and still recognisably the
 *      same height.
 *   4. The constrained maximum — the highest point of the country that does
 *      NOT own the summit — lies on the boundary line, not in the interior.
 *      That is the lesson the mountain exists to teach; if smoothing broke it,
 *      the fit is rejected and a finer one is tried.
 *
 * Smoothing is auto-tuned per mountain: the coarsest fit that passes every
 * test wins, because the coarsest passing fit is the one with the fewest
 * spurious relative maxima. See elias.js for why smoothness matters at all.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';
import { CATALOGUE, LINES, KY, kxAt } from './atlas-catalogue.mjs';

const here = dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------- tile plumbing */

const cache = new Map();
let fetched = 0;

// Tiles are also kept on disk between runs. Locating nineteen summits is an
// iterative business — widen a window, re-probe, adjust a seed — and refetching
// a few hundred tiles each time is both slow and rude to a public bucket.
const TILE_DIR = process.env.BORDER_TILE_CACHE
  || join(here, '..', '.tilecache');
mkdirSync(TILE_DIR, { recursive: true });

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
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      writeFileSync(disk, bytes);
      const png = PNG.sync.read(bytes);
      cache.set(key, png);
      fetched++;
      return png;
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
    }
  }
  throw new Error(`${url} -> ${last.message}`);
}

/** Elevation in metres at (lon, lat), bilinear over the tile pixels. */
async function elevation(z, lon, lat) {
  const [xr, yr] = tileXY(lon, lat, z);
  const px = xr * 256, py = yr * 256;
  const x0 = Math.floor(px - 0.5), y0 = Math.floor(py - 0.5);
  const fx = px - 0.5 - x0, fy = py - 0.5 - y0;
  const at = async (gx, gy) => {
    const tx = Math.floor(gx / 256), ty = Math.floor(gy / 256);
    const png = await tile(z, tx, ty);
    const i = ((gy - ty * 256) * 256 + (gx - tx * 256)) * 4;
    const d = png.data;
    return d[i] * 256 + d[i + 1] + d[i + 2] / 256 - 32768;
  };
  const h00 = await at(x0, y0), h10 = await at(x0 + 1, y0);
  const h01 = await at(x0, y0 + 1), h11 = await at(x0 + 1, y0 + 1);
  return h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy)
    + h01 * (1 - fx) * fy + h11 * fx * fy;
}

/* ------------------------------------------------------- the boundary */

/**
 * The international boundary in the mountain's own local kilometres, as the
 * line n·(x, y) = c with |n| = 1, plus which sign of n·p − c is the summit's
 * country.
 *
 * A parallel and a meridian are exact by definition. A treaty straight line is
 * exact too: a straight segment is completely determined by its endpoints, so
 * projecting those two points into the local tangent plane and joining them
 * reproduces the legal line — there is no polyline to sample and no
 * cartographic generalisation to inherit.
 */
function boundaryLine(entry, lat0, lon0) {
  const KX = kxAt(lat0);
  const b = entry.boundary;
  if (b.parallel !== undefined) {
    const y = (b.parallel - lat0) * KY;            // the line y = y
    const sign = entry.inside === 'n' ? 1 : -1;    // summit north or south of it
    return { nx: 0, ny: sign, c: sign * y, label: `${b.parallel}th parallel` };
  }
  if (b.meridian !== undefined) {
    const x = (b.meridian - lon0) * KX;            // the line x = x
    const sign = entry.inside === 'e' ? 1 : -1;
    return { nx: sign, ny: 0, c: sign * x, label: `${Math.abs(b.meridian)}° meridian` };
  }
  const seg = LINES[b.line];
  const A = [(seg.a[1] - lon0) * KX, (seg.a[0] - lat0) * KY];
  const B = [(seg.b[1] - lon0) * KX, (seg.b[0] - lat0) * KY];
  let dx = B[0] - A[0], dy = B[1] - A[1];
  const len = Math.hypot(dx, dy);
  dx /= len; dy /= len;
  // Left of a→b is the +90° rotation of the direction.
  let nx = -dy, ny = dx;
  if (entry.inside === 'right') { nx = -nx; ny = -ny; }
  return { nx, ny, c: nx * A[0] + ny * A[1], label: `treaty line ${b.line}` };
}

/** Signed distance in km: positive on the summit's own side. */
const sideOf = (L, x, y) => L.nx * x + L.ny * y - L.c;

/* ------------------------------------------------------- the DEM grid */

async function sampleGrid(entry) {
  const half = entry.halfKm;
  const N = entry.samples || 257;
  const step = (2 * half) / (N - 1);
  // Pick the tile zoom so one source pixel is about half a sample step: fine
  // enough that we are not inventing detail, coarse enough not to fetch the
  // world.
  const targetPx = (step * 1000) / 2;
  const z = Math.max(8, Math.min(13,
    Math.round(Math.log2((156543.03 * Math.cos((entry.lat * Math.PI) / 180)) / targetPx))));

  const KX = kxAt(entry.lat);
  const lonOf = (x) => entry.lon + x / KX;
  const latOf = (y) => entry.lat + y / KY;

  const H = new Float64Array(N * N);
  for (let j = 0; j < N; j++) {
    const lat = latOf(-half + j * step);
    for (let i = 0; i < N; i++) {
      H[j * N + i] = await elevation(z, lonOf(-half + i * step), lat);
    }
  }
  return { H, N, step, half, z };
}

/**
 * Highest sample within `seekKm` of a point, refined by local search.
 *
 * The point defaults to the window's centre, but once the window is pushed off
 * the summit it has to be given explicitly — `cxSeek`, `cySeek`.
 */
function findSummit(grid) {
  const { H, N, step, half } = grid;
  const sx = grid.cxSeek || 0, sy = grid.cySeek || 0;
  let bi = 0, bj = 0, bv = -Infinity;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = -half + i * step, y = -half + j * step;
      if (Math.hypot(x - sx, y - sy) > grid.seekKm) continue;
      const v = H[j * N + i];
      if (v > bv) { bv = v; bi = i; bj = j; }
    }
  }
  return { x: -half + bi * step, y: -half + bj * step, metres: bv };
}

/** The floor of the window, for measuring relief. */
function lowest(f, half, n = 120) {
  let lo = Infinity;
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const v = f(-half + (2 * half * i) / n, -half + (2 * half * j) / n);
      if (isFinite(v) && v < lo) lo = v;
    }
  }
  return lo;
}

/**
 * The prominent peaks of a window, strongest first.
 *
 * Wikipedia and the gazetteers are not reachable from this build, so summit
 * coordinates cannot simply be looked up — they have to be found in the
 * elevation model. Height alone will not do it: in the North Cascades half a
 * dozen named peaks stand within a few kilometres and the tallest sample near
 * a rough seed is regularly the wrong one.
 *
 * What identifies a *named mountain* is dominance: how far you must travel
 * before the ground is higher than where you stand. A knife-edge sub-summit on
 * a ridge is beaten a few hundred metres away; a named peak holds its own for
 * kilometres. So every local maximum gets its dominance radius, and the list is
 * ranked by it. Matching that list against the atlas's stated elevation pins
 * the mountain — and when nothing in the list is near the stated elevation,
 * that is worth knowing too.
 */
function prominentPeaks(grid, limit = 10) {
  const { H, N, step, half } = grid;
  const cands = [];
  for (let j = 1; j < N - 1; j++) {
    for (let i = 1; i < N - 1; i++) {
      const v = H[j * N + i];
      let top = true;
      for (let dj = -1; dj <= 1 && top; dj++) {
        for (let di = -1; di <= 1; di++) {
          if ((di || dj) && H[(j + dj) * N + i + di] > v) { top = false; break; }
        }
      }
      if (top) cands.push({ i, j, v });
    }
  }
  cands.sort((a, b) => b.v - a.v);
  const keep = cands.slice(0, 400);
  for (const c of keep) {
    // Dominance: the distance to the nearest strictly higher sample, capped
    // at the window so the window's own high point does not run away with it.
    let best = Infinity;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        if (H[j * N + i] <= c.v) continue;
        const d = Math.hypot((i - c.i) * step, (j - c.j) * step);
        if (d < best) best = d;
      }
    }
    c.dom = best;
    c.x = -half + c.i * step;
    c.y = -half + c.j * step;
  }
  keep.sort((a, b) => (b.dom === a.dom ? b.v - a.v : b.dom - a.dom));
  return keep.slice(0, limit);
}

/* --------------------------------------------------- the smooth fit */

function dct1(vec) {
  const N = vec.length, out = new Float64Array(N);
  for (let j = 0; j < N; j++) {
    let s = 0.5 * (vec[0] + (j % 2 ? -1 : 1) * vec[N - 1]);
    for (let i = 1; i < N - 1; i++) s += vec[i] * Math.cos(Math.PI * j * i / (N - 1));
    out[j] = (2 / (N - 1)) * s;
  }
  return out;
}

/** Full DCT-I of the grid, computed once and truncated many times. */
function analyse(grid) {
  const { H, N } = grid;
  const rows = new Array(N);
  for (let j = 0; j < N; j++) rows[j] = dct1(H.subarray(j * N, (j + 1) * N));
  const cols = new Array(N);
  const col = new Float64Array(N);
  for (let j = 0; j < N; j++) {
    for (let k = 0; k < N; k++) col[k] = rows[k][j];
    cols[j] = dct1(col);                 // cols[j][k]
  }
  return cols;
}

/** Tapered, truncated coefficients, flat as c[k * M + j]. */
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

function evaluator(c, M, half) {
  const L = 2 * half;
  const cj = new Float64Array(M), ck = new Float64Array(M);
  return (x, y) => {
    const tx = Math.PI * (x + half) / L, ty = Math.PI * (y + half) / L;
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

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1],
  [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071]];

/** Pattern-search maximum of f over the window, optionally constrained. */
function maximise(f, half, step, ok) {
  let bx = 0, by = 0, bv = -Infinity;
  for (let y = -half; y <= half + 1e-9; y += step) {
    for (let x = -half; x <= half + 1e-9; x += step) {
      if (ok && !ok(x, y)) continue;
      const v = f(x, y);
      if (v > bv) { bv = v; bx = x; by = y; }
    }
  }
  for (let s = step; s > 1e-6;) {
    let moved = false;
    for (const [dx, dy] of DIRS) {
      const x = bx + dx * s, y = by + dy * s;
      if (Math.abs(x) > half || Math.abs(y) > half) continue;
      if (ok && !ok(x, y)) continue;
      const v = f(x, y);
      if (v > bv) { bv = v; bx = x; by = y; moved = true; }
    }
    if (!moved) s /= 2;
  }
  return { x: bx, y: by, metres: bv };
}

function countMaxima(f, half, N) {
  const step = (2 * half) / (N - 1);
  const val = new Float64Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) val[j * N + i] = f(-half + i * step, -half + j * step);
  }
  let n = 0;
  for (let j = 1; j < N - 1; j++) {
    for (let i = 1; i < N - 1; i++) {
      const v = val[j * N + i];
      let best = -Infinity;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (di || dj) best = Math.max(best, val[(j + dj) * N + i + di]);
        }
      }
      if (v > best + 1) n++;
    }
  }
  return n;
}

/* ---------------------------------------------------------- encoding */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const QUANTUM = 0.02;                       // metres per coefficient step

function encode(c) {
  const out = [];
  for (let i = 0; i < c.length; i++) {
    const q = Math.round(c[i] / QUANTUM);
    let z = q < 0 ? -q * 2 - 1 : q * 2;
    while (z >= 32) { out.push(ALPHABET[(z & 31) | 32]); z = Math.floor(z / 32); }
    out.push(ALPHABET[z]);
  }
  return out.join('');
}

function decode(s, n) {
  const c = new Float64Array(n);
  let i = 0, k = 0;
  const V = new Int8Array(128).fill(-1);
  for (let a = 0; a < ALPHABET.length; a++) V[ALPHABET.charCodeAt(a)] = a;
  while (i < s.length && k < n) {
    let z = 0, shift = 1, ch;
    do {
      ch = V[s.charCodeAt(i++)];
      z += (ch & 31) * shift;
      shift *= 32;
    } while (ch & 32);
    c[k++] = ((z & 1) ? -(z + 1) / 2 : z / 2) * QUANTUM;
  }
  return c;
}

/* --------------------------------------------------------------- run */

const args = process.argv.slice(2);
const probeOnly = args.includes('--probe');
const peaksOnly = args.includes('--peaks');
const wanted = args.filter((a) => !a.startsWith('--'));
const list = wanted.length ? CATALOGUE.filter((e) => wanted.includes(e.id)) : CATALOGUE;

if (peaksOnly) {
  // Coordinate discovery: what named-mountain-sized peaks are actually here?
  for (const entry of list) {
    // The window we would actually bake, at the resolution we would bake it:
    // the peak this finds is the peak the shipped surface will have.
    const wide = { ...entry, samples: 257 };
    const grid = await sampleGrid(wide);
    const L = boundaryLine(entry, entry.lat, entry.lon);
    const KX = kxAt(entry.lat);
    console.log(`\n=== ${entry.name}  (atlas ${entry.metres} m, ${entry.atlasKm} km, ${entry.grade})`
      + `  window ±${wide.halfKm} km @ ${(grid.step * 1000).toFixed(0)} m`);
    const all = prominentPeaks(grid, 120);
    const show = (p) => {
      const d = sideOf(L, p.x, p.y);
      console.log(`   ${p.v.toFixed(0).padStart(5)} m  dom ${(p.dom === Infinity ? '  top' : p.dom.toFixed(1)).padStart(5)} km`
        + `  at ${(entry.lat + p.y / KY).toFixed(5)}, ${(entry.lon + p.x / KX).toFixed(5)}`
        + `  ${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(2)} km from the line`);
    };
    console.log('  -- most dominant --');
    for (const p of all.slice(0, 5)) show(p);
    // The atlas states an elevation and a summit-to-border distance. The peak
    // that matches both, on the correct side, is the mountain it means.
    const scored = all
      .filter((p) => sideOf(L, p.x, p.y) > 0 && p.dom > 0.6)
      .map((p) => {
        const d = sideOf(L, p.x, p.y);
        return { p, s: Math.abs(p.v - entry.metres) / entry.metres * 3
          + Math.abs(d - entry.atlasKm) / Math.max(1, entry.atlasKm) };
      })
      .sort((a, b) => a.s - b.s);
    console.log('  -- best agreement with the atlas --');
    for (const { p, s } of scored.slice(0, 4)) { process.stdout.write(`  [${s.toFixed(2)}]`); show(p); }
  }
  process.exit(0);
}

const results = [];
let failures = 0;

for (const entry of list) {
  process.stdout.write(`\n=== ${entry.name} (${entry.id})\n`);
  const grid = await sampleGrid(entry);
  grid.seekKm = entry.seekKm;
  const peak = findSummit(grid);
  const L = boundaryLine(entry, entry.lat, entry.lon);
  const dist = sideOf(L, peak.x, peak.y);
  const err = Math.abs(peak.metres - entry.metres) / entry.metres;

  const KX = kxAt(entry.lat);
  console.log(`  DEM z${grid.z}, ${grid.N}x${grid.N} @ ${(grid.step * 1000).toFixed(0)} m`
    + `, ${cache.size} tiles cached (${fetched} fetched)`);
  console.log(`  summit ${peak.metres.toFixed(0)} m (atlas ${entry.metres} m, ${(err * 100).toFixed(1)}% off)`
    + ` at ${(entry.lat + peak.y / KY).toFixed(5)}, ${(entry.lon + peak.x / KX).toFixed(5)}`);
  console.log(`  ${L.label}: summit ${Math.abs(dist).toFixed(2)} km`
    + ` ${dist > 0 ? 'on its own side ✓' : 'ON THE WRONG SIDE ✗'}`);

  if (err > 0.06) { console.log('  !! elevation disagrees with the atlas — wrong peak?'); failures++; }
  if (dist <= 0) { console.log('  !! summit is not in the country the atlas names'); failures++; }
  if (probeOnly) { results.push({ entry, peak, dist, err }); continue; }

  // ---- how big a window may this mountain claim? -------------------------
  //
  // Two conditions have to hold at once for the lesson to be true, and both
  // are conditions on the window rather than on the mountain:
  //
  //   the named summit must be the highest point in it — otherwise "the peak
  //   you cannot reach" is some other mountain entirely;
  //
  //   and the highest point of the country that does NOT own the summit must
  //   lie on the frontier — which fails the moment the window reaches far
  //   enough across the line to swallow a second summit over there. On the
  //   49th parallel that happens quickly: American Border Peak has Canadian
  //   Border Peak less than three kilometres north of it.
  //
  const lat0 = entry.lat + peak.y / KY;
  const lon0 = entry.lon + peak.x / KX;
  const L2 = boundaryLine(entry, lat0, lon0);
  const feasible = (x, y) => sideOf(L2, x, y) <= 0;      // the OTHER country

  // The window: as much country as possible, as little of the other side as
  // the lesson allows
  // ------------------------------------------------------------------------
  // Two pressures pull in opposite directions. The lesson is a statement about
  // a region — *within this window*, the highest point of the country that does
  // not own the summit lies on the frontier — and it fails as soon as the
  // window reaches far enough across the line to swallow a second summit over
  // there. American Border Peak has Canadian Border Peak less than three
  // kilometres north. But a window sized to that constraint alone is a couple
  // of kilometres square, which is a hillside, not a mountain: there is nothing
  // to explore and the relief is lost against the width.
  //
  // Both are satisfied by moving the window rather than shrinking it. The
  // domain does not have to be centred on the summit: pushed back into the
  // summit's own country by `shift`, a window of half-width `half` still only
  // reaches `half − dist − shift` past the frontier. So the feasible strip
  // stays as shallow as the lesson needs while the walkable area grows with
  // the square of the half-width — several times the ground, all of it on the
  // side where the mountain actually is.
  //
  // The search runs widest-first and keeps the first window whose claim holds.
  let chosen = null, g = null, rawPeak = null;
  const plans = [];
  for (const half of [14, 11, 9, 7.5, 6, 5, 4, 3.2, 2.6, 2.1]) {
    for (const strip of [2.6, 2.0, 1.5, 1.1, 0.8, 0.6]) {
      const shift = half - dist - strip;
      if (shift < 0) continue;                 // window too small to reach the line
      plans.push({ half, strip, shift });
    }
  }
  // Widest first; among equals, the shallower strip across the border.
  plans.sort((a, b) => (b.half - a.half) || (a.strip - b.strip));

  for (const plan of plans) {
    const { half, shift } = plan;
    // Centre pushed along the summit's own normal, in local km, then turned
    // back into a latitude and longitude for the sampler.
    const cx = L2.nx * shift, cy = L2.ny * shift;
    const gg = await sampleGrid({
      ...entry, lat: lat0 + cy / KY, lon: lon0 + cx / kxAt(lat0), halfKm: half,
    });
    gg.cx = cx; gg.cy = cy;

    // Everything below works in the WINDOW's frame, whose origin is the
    // shifted centre rather than the summit. Two things move with it: the
    // summit, now at −(cx, cy), and the boundary, whose offset drops by the
    // shift because the centre moved that far along its own normal.
    const Sx = -cx, Sy = -cy;
    const Lw = { nx: L2.nx, ny: L2.ny, c: L2.c - shift };
    const feasibleW = (x, y) => sideOf(Lw, x, y) <= 0;

    const cols = analyse(gg);
    const raw = findSummit({ ...gg, seekKm: gg.half * 3, cxSeek: Sx, cySeek: Sy });

    // Every level that passes is collected rather than the first one taken.
    // Stopping at the first pass would always choose the heaviest smoothing
    // available, which flattens a sharp summit by a tenth of its height for no
    // reason; what is actually wanted is the *sharpest* fit that still keeps
    // the surface honest — closest to the real mountain, with the count of
    // relative maxima still in single figures.
    const passes = [];
    for (const [M, sigma] of [[16, 5], [20, 6], [24, 7], [28, 8], [32, 9], [40, 11],
      [48, 13], [56, 15], [64, 18], [72, 20], [80, 22], [96, 26], [112, 30]]) {
      if (M > gg.N - 1) break;
      const c = truncate(cols, M, sigma);
      const f = evaluator(c, M, gg.half);
      // The named mountain's own summit on the smooth surface: near where the
      // elevation model put it, and on its own side of the line.
      const mine = maximise(f, gg.half, gg.step * 2,
        (x, y) => Math.hypot(x - Sx, y - Sy) < 1.0 && sideOf(Lw, x, y) > 0);
      const con = maximise(f, gg.half, gg.step * 2, feasibleW);
      const offLine = Math.abs(sideOf(Lw, con.x, con.y));
      const onEdge = Math.abs(con.x) > gg.half * 0.97 || Math.abs(con.y) > gg.half * 0.97;
      const kept = mine.metres / f(Sx, Sy);
      const onLine = offLine < Math.max(0.08, gg.step * 2);
      const below = con.metres < mine.metres - 5;
      const summitKept = f(Sx, Sy) / raw.metres;
      const maxima = countMaxima(f, gg.half, 129);
      const ok = onLine && !onEdge && below && kept > 0.9 && summitKept > 0.84;
      if (ok) passes.push({ M, sigma, c, f, top: mine, con, offLine, maxima, kept: summitKept });
    }

    // Sharpest fit whose relative maxima stay in single figures; failing that,
    // simply the gentlest one that passed at all.
    // How many relative maxima are "too many" depends on how much ground the
    // window covers: eighteen kilometres of the North Cascades genuinely
    // contains a dozen or more summits, and refusing to show them would be
    // smoothing away the mountains rather than the sampling artefacts.
    const allowed = 3 + (2 * gg.half) ** 2 / 24;
    const tidy = passes.filter((p) => p.maxima <= allowed);
    const hit = tidy.length ? tidy[tidy.length - 1] : (passes[0] || null);

    if (hit) {
      console.log(`  window ±${half.toFixed(2)} km, centre pushed ${shift.toFixed(2)} km into`
        + ` ${entry.countries[0].split(' (')[0]}, ${plan.strip.toFixed(1)} km of the far side:`
        + ` M=${hit.M} of ${passes.length} passing, keeps ${(hit.kept * 100).toFixed(0)}% of the summit,`
        + ` constrained ${hit.con.metres.toFixed(0)} m at ${(hit.offLine * 1000).toFixed(0)} m`
        + ` off the line, ${hit.maxima} maxima ✓`);
      chosen = hit; g = gg; rawPeak = raw;
      chosen.Sx = Sx; chosen.Sy = Sy; chosen.Lw = Lw; chosen.shift = shift; chosen.strip = plan.strip;
      break;
    }
  }

  if (!chosen) { console.log('  !! no window makes the constrained maximum land on the frontier'); failures++; continue; }

  // fidelity of the accepted fit
  let se = 0, n = 0;
  for (let j = 0; j < g.N; j += 2) {
    for (let i = 0; i < g.N; i += 2) {
      const e = chosen.f(-g.half + i * g.step, -g.half + j * g.step) - g.H[j * g.N + i];
      se += e * e; n++;
    }
  }
  const rms = Math.sqrt(se / n);
  const data = encode(chosen.c);
  // the decoder must reproduce the encoder
  const back = decode(data, chosen.M * chosen.M);
  let qErr = 0;
  for (let i = 0; i < back.length; i++) qErr = Math.max(qErr, Math.abs(back[i] - chosen.c[i]));

  console.log(`  chosen M=${chosen.M} sigma=${chosen.sigma}: rms ${rms.toFixed(0)} m,`
    + ` ${chosen.maxima} maxima, ${(data.length / 1024).toFixed(1)} KB`
    + ` (quantisation ${qErr.toFixed(3)} m)`);

  // How the frontier is described on screen: the thing that makes these
  // constraints worth teaching is that they are lines somebody *defined*, so
  // the card names the definition rather than saying "the border".
  const b = entry.boundary;
  const [boundaryLabel, boundaryLabelEs] = b.parallel !== undefined
    ? [`the ${b.parallel}th parallel north`, `el paralelo ${b.parallel} norte`]
    : b.meridian !== undefined
      ? [`the ${Math.abs(b.meridian)}th meridian ${b.meridian < 0 ? 'west' : 'east'}`,
        `el meridiano ${Math.abs(b.meridian)} ${b.meridian < 0 ? 'oeste' : 'este'}`]
      : [entry.treaty || 'a straight treaty line', entry.treatyEs || 'una línea recta de tratado'];

  // A vertical exaggeration that makes the mountain read as one.
  //
  // At true scale a two-kilometre peak in a twenty-kilometre window is a gentle
  // swelling — honestly so, which is the point Saint Elias makes. But an
  // example nobody recognises as a mountain teaches nothing, so each of these
  // opens with the z axis stretched to bring the relief to about a third of the
  // window's width: the proportion a relief model or a physical globe uses, and
  // the same trick an atlas plays. It is a display scale only — f, its
  // gradients and every readout stay in real kilometres — and the dial is right
  // there to put it back to 1.
  const relief = (chosen.f(chosen.Sx, chosen.Sy) - lowest(chosen.f, g.half)) / 1000;
  const want = (2 * g.half) * 0.33;
  const exaggeration = Math.max(1, Math.min(9, want / Math.max(0.05, relief)));

  results.push({
    entry, lat0, lon0, half: g.half, M: chosen.M, sigma: chosen.sigma, data,
    line: chosen.Lw, rms, maxima: chosen.maxima, boundaryLabel, boundaryLabelEs,
    shift: chosen.shift, strip: chosen.strip, exaggeration,
    summitMetres: chosen.f(chosen.Sx, chosen.Sy),
    summitAt: { x: chosen.Sx, y: chosen.Sy },
    summit: { x: chosen.top.x, y: chosen.top.y, metres: chosen.top.metres },
    constrained: { x: chosen.con.x, y: chosen.con.y, metres: chosen.con.metres, offLine: chosen.offLine },
    rawPeak: rawPeak.metres,
    demStep: g.step, z: g.z,
  });
}

if (probeOnly) {
  console.log(`\n${results.length} probed, ${failures} problem(s)`);
  process.exit(failures ? 1 : 0);
}

if (failures) { console.log(`\n${failures} problem(s) — nothing written`); process.exit(1); }

/* ------------------------------------------------------------- emit */

const round = (v, d = 4) => {
  const r = Number(v.toFixed(d));
  return Object.is(r, -0) ? 0 : r;
};

const J = (v) => JSON.stringify(v);
const entries = results.map((r) => `  ${J(r.entry.id)}: {
    M: ${r.M}, half: ${round(r.half, 3)}, lat: ${round(r.lat0, 5)}, lon: ${round(r.lon0, 5)},
    line: { nx: ${round(r.line.nx, 6)}, ny: ${round(r.line.ny, 6)}, c: ${round(r.line.c, 5)} },
    summit: { x: ${round(r.summitAt.x, 3)}, y: ${round(r.summitAt.y, 3)}, metres: ${round(r.summitMetres, 1)} },
    localTop: { x: ${round(r.summit.x, 3)}, y: ${round(r.summit.y, 3)}, metres: ${round(r.summit.metres, 1)} },
    constrained: { x: ${round(r.constrained.x, 3)}, y: ${round(r.constrained.y, 3)}, metres: ${round(r.constrained.metres, 1)} },
    rawPeak: ${round(r.rawPeak, 1)}, rms: ${round(r.rms, 1)}, maxima: ${r.maxima},
    frontierKm: ${round(Math.abs(sideOf(r.line, r.summitAt.x, r.summitAt.y)), 3)},
    exaggeration: ${round(r.exaggeration, 2)}, shift: ${round(r.shift, 2)}, strip: ${round(r.strip, 2)},
    meta: {
      name: ${J(r.entry.name)}, es: ${J(r.entry.es)},
      countries: ${J(r.entry.countries)}, countriesEs: ${J(r.entry.countriesEs)},
      atlasMetres: ${r.entry.metres}, grade: ${J(r.entry.grade)}, biome: ${J(r.entry.biome)},
      boundary: ${J(r.boundaryLabel)}, boundaryEs: ${J(r.boundaryLabelEs)},
      credit: ${J(r.entry.credit)}, ofItself: ${r.entry.ofItself},
      blurb: ${J(r.entry.blurb)}, blurbEs: ${J(r.entry.blurbEs)},
    },
    d: '${r.data}',
  },`).join('\n');

const out = `/**
 * borders-data.js — the border mountains, as finite cosine series. GENERATED
 * by tools/build-borders.mjs from public-domain elevation models; do not edit
 * by hand.
 *
 * Per mountain: M x M tapered DCT coefficients, quantised to ${QUANTUM} m and written
 * as zigzag base-64 varints (the same encoding the coastline and the elevation
 * grid use), the local tangent-plane origin, and the international boundary as
 * the line nx*x + ny*y = c with the summit's own country at nx*x + ny*y > c.
 * Coordinates are kilometres east and north of the summit; heights metres.
 */
export const QUANTUM = ${QUANTUM};
export const BORDERS = {
${entries}
};
`;

const dest = join(here, '..', 'app', 'js', 'borders-data.js');
writeFileSync(dest, out);
console.log(`\n${dest}  ${(out.length / 1024).toFixed(0)} KB, ${results.length} mountains`);
