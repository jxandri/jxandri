/**
 * build-slopes.mjs — bake the frontier slopes found by find-frontiers.mjs.
 *
 * The atlas mountains answer "what happens when a frontier crosses a summit".
 * These answer the more common and, for a class, the more useful question:
 * what happens when it crosses a *hillside*. See find-frontiers.mjs for how
 * they are chosen; this turns each chosen window into the same kind of object
 * every other surface in the program is — a finite cosine series, infinitely
 * differentiable, with a linear constraint travelling beside it.
 *
 * Three things differ from build-borders.mjs, and all three come from the
 * geometry rather than from taste:
 *
 *   The window is a rectangle, not a square. Its length runs *along* the
 *   frontier, where extra kilometres cost nothing, and its depth runs across,
 *   where every extra kilometre is another chance to swallow a rival summit.
 *   That is what lets the feasible country be seventy per cent of a window
 *   twenty or thirty kilometres wide instead of five per cent of one three
 *   kilometres wide.
 *
 *   The frontier is axis-aligned by construction, because a parallel is
 *   y = constant and a meridian is x = constant in local kilometres. So the
 *   constraint a student reads in the box is `y <= 3.4`, which is the simplest
 *   linear inequality there is.
 *
 *   The answer is not near the summit. On the atlas mountains the highest legal
 *   point is the point of the line closest to the peak, which a sharp student
 *   guesses without walking. Here the line runs for twenty kilometres over
 *   several spurs and the highest point on it is somewhere particular — you
 *   have to follow the frontier to find it, which is exactly the Lagrange
 *   search done on foot.
 *
 * Usage:  node tools/build-slopes.mjs [--pick p49w:0,p49w:1,m141:0 …]
 * Writes: app/js/slopes-data.js
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';

const here = dirname(fileURLToPath(import.meta.url));
const KY = 110.574;
const kxAt = (lat) => 111.320 * Math.cos((lat * Math.PI) / 180);

/* ------------------------------------------------------- tile plumbing */

const TILE_DIR = process.env.BORDER_TILE_CACHE || join(here, '..', '.tilecache');
mkdirSync(TILE_DIR, { recursive: true });
const cache = new Map();
let fetched = 0;

function tileXY(lon, lat, z) {
  const n = 2 ** z;
  const rad = (lat * Math.PI) / 180;
  return [((lon + 180) / 360) * n,
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n];
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
      fetched++;
      return png;
    } catch (e) { last = e; await new Promise((r) => setTimeout(r, 300 * 2 ** a)); }
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

/* ------------------------------------------------ the smooth surface */

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

/** The series on a rectangle: one half-width per axis, square index space. */
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

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1],
  [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071]];

/** Pattern-search maximum over a rectangle, optionally constrained. */
function maximise(f, hx, hy, step, ok) {
  let bx = 0, by = 0, bv = -Infinity;
  for (let y = -hy; y <= hy + 1e-9; y += step) {
    for (let x = -hx; x <= hx + 1e-9; x += step) {
      if (ok && !ok(x, y)) continue;
      const v = f(x, y);
      if (v > bv) { bv = v; bx = x; by = y; }
    }
  }
  for (let s = step; s > 1e-6;) {
    let moved = false;
    for (const [dx, dy] of DIRS) {
      const x = bx + dx * s, y = by + dy * s;
      if (Math.abs(x) > hx || Math.abs(y) > hy) continue;
      if (ok && !ok(x, y)) continue;
      const v = f(x, y);
      if (v > bv) { bv = v; bx = x; by = y; moved = true; }
    }
    if (!moved) s /= 2;
  }
  return { x: bx, y: by, metres: bv };
}

function countMaxima(f, hx, hy, N) {
  const val = new Float64Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      val[j * N + i] = f(-hx + (2 * hx * i) / (N - 1), -hy + (2 * hy * j) / (N - 1));
    }
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
const QUANTUM = 0.02;

function encode(c) {
  const out = [];
  for (let i = 0; i < c.length; i++) {
    let z = Math.round(c[i] / QUANTUM);
    z = z < 0 ? -z * 2 - 1 : z * 2;
    while (z >= 32) { out.push(ALPHABET[(z & 31) | 32]); z = Math.floor(z / 32); }
    out.push(ALPHABET[z]);
  }
  return out.join('');
}

/* -------------------------------------------------------- the borders */

const BORDERS = {
  p49w: {
    kind: 'parallel', value: 49,
    label: 'the 49th parallel north', labelEs: 'el paralelo 49 norte',
    // [the country that owns the peak, the country you are standing in] is
    // filled per window, because which side is higher is a fact about the
    // ground and changes along the line.
    north: ['Canada (British Columbia)', 'Canadá (Columbia Británica)'],
    south: ['United States (Washington / Idaho / Montana)', 'Estados Unidos (Washington / Idaho / Montana)'],
    treaty: 'fixed by the Anglo-American Convention of 1818 and the Oregon Treaty of 1846',
    treatyEs: 'fijado por la Convención Angloamericana de 1818 y el Tratado de Oregón de 1846',
  },
  m141: {
    kind: 'meridian', value: -141,
    label: 'the 141st meridian west', labelEs: 'el meridiano 141 oeste',
    east: ['Canada (Yukon)', 'Canadá (Yukón)'],
    west: ['United States (Alaska)', 'Estados Unidos (Alaska)'],
    treaty: 'fixed by the Anglo-Russian Convention of 1825 and inherited by the United States in 1867',
    treatyEs: 'fijado por la Convención Anglo-Rusa de 1825 y heredado por Estados Unidos en 1867',
  },
};

/* --------------------------------------------------------------- run */

const args = process.argv.slice(2);
const pickArg = args.includes('--pick') ? args[args.indexOf('--pick') + 1] : null;
const picks = pickArg ? new Set(pickArg.split(',')) : null;

const found = JSON.parse(readFileSync(join(here, '..', '.scratch', 'frontiers.json'), 'utf8'));

const results = [];
let failures = 0;

for (const [bid, list] of Object.entries(found)) {
  const border = BORDERS[bid];
  if (!border) { console.log(`!! no definition for border ${bid}`); continue; }
  const parallel = border.kind === 'parallel';

  for (let k = 0; k < list.length; k++) {
    if (picks && !picks.has(`${bid}:${k}`)) continue;
    const w = list[k];
    const id = `${bid}${k}`;

    // The window, in local kilometres about its own centre. x runs along the
    // frontier and y across it, with +y towards the country that owns the peak.
    const halfX = w.b;
    const halfY = (w.D + w.U) / 2;
    // The frontier sits at y = yLine: D below it, U above.
    const yLine = halfY - w.U;
    // The centre in degrees. `sign` says which way the peak's country lies.
    const centreAcross = (w.U - w.D) / 2 * w.sign;
    const lat0 = parallel ? border.value + centreAcross / KY : w.centre;
    const lon0 = parallel ? w.centre : border.value + centreAcross / kxAt(w.centre);
    const KX = kxAt(lat0);

    // In the app's frame x is east and y is north, always. For a parallel that
    // is already along/across; for a meridian the two swap, and `flip` records
    // it so the sampler and the emitted line agree.
    const flip = !parallel;
    const hx = flip ? halfY : halfX;      // east half-width
    const hy = flip ? halfX : halfY;      // north half-width
    // The constraint, in east/north: y <= c for a parallel, x <= c for a
    // meridian, with the sign following which side owns the peak.
    const line = parallel
      ? { nx: 0, ny: w.sign, c: w.sign * (w.sign > 0 ? yLine : -yLine) }
      : { nx: w.sign, ny: 0, c: w.sign * (w.sign > 0 ? yLine : -yLine) };

    console.log(`\n=== ${id}  ${border.label} at `
      + `${parallel ? `${Math.abs(w.centre).toFixed(3)}°W` : `${Math.abs(w.centre).toFixed(3)}°N`}`
      + `  ${(2 * hx).toFixed(1)} x ${(2 * hy).toFixed(1)} km`);

    // Sample.
    //
    // The transform wants a square lattice and the window is not square, so the
    // long axis gets the coarser posts: at 385 samples a 32 km window is read
    // every 83 m while its 15 km depth is read every 39 m. The elevation model
    // resolves about 25 m here, so 83 m throws away two thirds of what it
    // knows along the frontier — and the fit that came out of it lost 340 m off
    // the peak, cutting the number the example exists to show, the altitude the
    // frontier costs you, from 323 m to 173. 641 brings the long axis to 50 m,
    // which the model does support, for about four times the transform's cost.
    const N = 641;
    const stepX = (2 * hx) / (N - 1), stepY = (2 * hy) / (N - 1);
    const z = Math.max(8, Math.min(13, Math.round(
      Math.log2((156543.03 * Math.cos((lat0 * Math.PI) / 180)) / ((Math.min(stepX, stepY) * 1000) / 2)))));
    console.log(`  DEM z${z}, ${N}x${N} @ ${(stepX * 1000).toFixed(0)} x ${(stepY * 1000).toFixed(0)} m`);

    const H = new Float64Array(N * N);
    for (let j = 0; j < N; j++) {
      const lat = lat0 + (-hy + j * stepY) / KY;
      for (let i = 0; i < N; i++) {
        H[j * N + i] = await elevation(z, lon0 + (-hx + i * stepX) / KX, lat);
      }
    }
    let lo = Infinity, hiH = -Infinity;
    for (const v of H) { lo = Math.min(lo, v); hiH = Math.max(hiH, v); }

    const cols = analyse(H, N);
    const feasible = (x, y) => line.nx * x + line.ny * y - line.c <= 0;

    // The sharpest fit that still tells the truth. Same rule as the mountains:
    // collect every level that passes and take the finest, because the coarsest
    // passing fit flattens the very peak the example is about.
    // How sharp a fit the source can carry, stated directly rather than inferred
    // from a maxima count: a series with M modes resolves down to 2*width/M,
    // and asking for detail finer than about four elevation posts is inventing
    // ridges. Per axis, because the two axes are sampled differently — applying
    // the long axis's limit to the shallow one would throw away detail the
    // model is perfectly willing to give.
    const finestX = Math.max(0.2, stepX * 4), finestY = Math.max(0.2, stepY * 4);
    const passes = [];
    for (const [M, sigma] of [[24, 7], [32, 9], [40, 11], [48, 13], [56, 15], [64, 18],
      [72, 20], [80, 22], [96, 26], [112, 30]]) {
      if ((2 * hx) / M < finestX || (2 * hy) / M < finestY) break;
      const c = truncate(cols, M, sigma);
      const f = evaluator(c, M, hx, hy);
      const step = Math.min(stepX, stepY) * 2;
      const con = maximise(f, hx, hy, step, feasible);
      const free = maximise(f, hx, hy, step, (x, y) => !feasible(x, y));
      const offLine = Math.abs(line.nx * con.x + line.ny * con.y - line.c);
      const onLine = offLine < Math.max(0.09, step);
      const edge = Math.abs(con.x) > hx * 0.94 || Math.abs(con.y) > hy * 0.94;
      const peakInside = Math.abs(free.x) < hx * 0.9 && Math.abs(free.y) < hy * 0.9;
      const gain = free.metres - con.metres;
      const maxima = countMaxima(f, hx, hy, 121);
      const ok = onLine && !edge && peakInside && gain > 60;
      if (ok) passes.push({ M, sigma, c, f, con, free, offLine, gain, maxima });
    }
    // How many relative maxima is "too many" scales with the ground covered.
    // The mountains' allowance was written for a square window a few kilometres
    // across, where a dozen summits is already suspicious; these windows are
    // three to five hundred square kilometres of the North Cascades and the St
    // Elias massif, which genuinely hold dozens. One per four square kilometres
    // is still well below what the ground has, and it stops the ladder settling
    // on a fit so coarse that the peak is smoothed away.
    const allowed = 6 + (4 * hx * hy) / 4;
    const tidy = passes.filter((p) => p.maxima <= allowed);
    const hit = tidy.length ? tidy[tidy.length - 1] : (passes[passes.length - 1] || null);

    if (!hit) {
      console.log('  !! no fit keeps the constrained maximum on the frontier');
      failures++;
      continue;
    }

    let se = 0, n = 0;
    for (let j = 0; j < N; j += 2) {
      for (let i = 0; i < N; i += 2) {
        const e = hit.f(-hx + i * stepX, -hy + j * stepY) - H[j * N + i];
        se += e * e; n++;
      }
    }
    const rms = Math.sqrt(se / n);

    // And it has to look like the place. A fit five per cent of the relief away
    // from the ground is a different mountain wearing its name: one window came
    // out at 193 m of error over 2 200 m of relief because only the very
    // coarsest level survived the acceptance test, and the honest thing to do
    // with a window like that is to drop it rather than ship a caricature.
    if (rms > 0.05 * (hiH - lo)) {
      console.log(`  !! the only surviving fit is ${rms.toFixed(0)} m from the ground`
        + ` (${(100 * rms / (hiH - lo)).toFixed(1)}% of the relief) — dropped`);
      failures++;
      continue;
    }

    console.log(`  M=${hit.M} of ${passes.length} passing: line ${hit.con.metres.toFixed(0)} m`
      + ` at ${(hit.offLine * 1000).toFixed(0)} m off it, peak ${hit.free.metres.toFixed(0)} m`
      + ` (${hit.gain.toFixed(0)} m out of reach), ${hit.maxima} maxima, rms ${rms.toFixed(0)} m`);

    // Which countries, in [owns the peak, you are standing in] order.
    const pos = w.sign > 0;
    const pair = parallel
      ? (pos ? [border.north, border.south] : [border.south, border.north])
      : (pos ? [border.east, border.west] : [border.west, border.east]);

    const where = parallel
      ? `${Math.abs(w.centre).toFixed(2)}° W`
      : `${Math.abs(w.centre).toFixed(2)}° N`;
    const name = `${border.label[0].toUpperCase()}${border.label.slice(1)} at ${where}`;
    const nameEs = `${border.labelEs[0].toUpperCase()}${border.labelEs.slice(1)} en `
      + where.replace('.', ',').replace('W', 'O');

    // At true scale a kilometre of relief across thirty is a swelling. Stretch
    // it towards a quarter of the *shallow* axis, which is the one the eye
    // judges the slope by; display only, and the dial puts it back to 1.
    const relief = (hit.free.metres - lo) / 1000;
    const exaggeration = Math.max(1, Math.min(6, (2 * Math.min(hx, hy)) * 0.26 / Math.max(0.05, relief)));

    results.push({
      id, border, bid, w, hx, hy, line, lat0, lon0, z, N,
      M: hit.M, sigma: hit.sigma, data: encode(hit.c),
      rms, maxima: hit.maxima, exaggeration,
      con: hit.con, free: hit.free, gain: hit.gain, lo, hi: hiH,
      name, nameEs, pair, where,
    });
  }
}

if (!results.length) { console.log('\nnothing to write'); process.exit(1); }

/* ------------------------------------------------------------- emit */

const round = (v, d = 4) => {
  const r = Number(v.toFixed(d));
  return Object.is(r, -0) ? 0 : r;
};
const J = (v) => JSON.stringify(v);

const entries = results.map((r) => {
  const blurb = `${r.border.label[0].toUpperCase()}${r.border.label.slice(1)}, `
    + `${r.border.treaty}, runs straight across ${(2 * Math.max(r.hx, r.hy)).toFixed(0)} km of this `
    + `country without regard for any of it. Here it crosses a hillside rather than a summit: the `
    + `ground on the ${r.pair[1][0].split(' (')[0]} side falls away from the line, so most of what you `
    + `can see is yours to walk on, while the high ground — ${r.free ? Math.round(r.free.metres) : 0} m, `
    + `${Math.abs(r.con.y - r.free.y).toFixed(1)} km beyond the frontier — is not. `
    + `The best you may stand on is ${Math.round(r.con.metres)} m, somewhere along the line; `
    + `the frontier costs you ${Math.round(r.gain)} m.`;
  const blurbEs = `${r.border.labelEs[0].toUpperCase()}${r.border.labelEs.slice(1)}, `
    + `${r.border.treatyEs}, atraviesa en línea recta ${(2 * Math.max(r.hx, r.hy)).toFixed(0)} km de `
    + `este territorio sin atender a nada de él. Aquí cruza una ladera y no una cumbre: el terreno `
    + `del lado de ${r.pair[1][0].split(' (')[0]} desciende alejándose de la línea, de modo que casi todo `
    + `lo que se ve es suyo para caminarlo, mientras que la altura —${Math.round(r.free.metres)} m, a `
    + `${Math.abs(r.con.y - r.free.y).toFixed(1)} km del otro lado— no lo es. Lo más alto que puede `
    + `pisar son ${Math.round(r.con.metres)} m, en algún punto de la línea; la frontera le cuesta `
    + `${Math.round(r.gain)} m.`;

  return `  ${J(r.id)}: {
    kind: 'slope',
    M: ${r.M}, halfX: ${round(r.hx, 3)}, halfY: ${round(r.hy, 3)},
    lat: ${round(r.lat0, 5)}, lon: ${round(r.lon0, 5)},
    line: { nx: ${round(r.line.nx, 6)}, ny: ${round(r.line.ny, 6)}, c: ${round(r.line.c, 5)} },
    summit: { x: ${round(r.free.x, 3)}, y: ${round(r.free.y, 3)}, metres: ${round(r.free.metres, 1)} },
    localTop: { x: ${round(r.free.x, 3)}, y: ${round(r.free.y, 3)}, metres: ${round(r.free.metres, 1)} },
    constrained: { x: ${round(r.con.x, 3)}, y: ${round(r.con.y, 3)}, metres: ${round(r.con.metres, 1)} },
    rawPeak: ${round(r.hi, 1)}, rms: ${round(r.rms, 1)}, maxima: ${r.maxima},
    frontierKm: ${round(Math.abs(r.line.nx * r.free.x + r.line.ny * r.free.y - r.line.c), 3)},
    exaggeration: ${round(r.exaggeration, 2)}, shift: 0,
    strip: ${round((r.w.D), 2)}, feasFrac: 0.7,
    meta: {
      name: ${J(r.name)}, es: ${J(r.nameEs)},
      countries: ${J([r.pair[0][0], r.pair[1][0]])},
      countriesEs: ${J([r.pair[0][1], r.pair[1][1]])},
      atlasMetres: ${Math.round(r.free.metres)}, grade: "frontier slope",
      // The climate follows the peak the window actually contains: a 1 000 m
      // Yukon ridge is not the same place as a 4 600 m one in the St Elias.
      biome: ${J(r.free.metres < 1800 ? "temperate" : r.free.metres < 3200 ? "alpine" : "peak")},
      boundary: ${J(r.border.label)}, boundaryEs: ${J(r.border.labelEs)},
      // No photograph: these are stretches of a line, not catalogued
      // mountains, and a picture captioned as one would be a lie.
      credit: "", ofItself: true,
      blurb: ${J(blurb)},
      blurbEs: ${J(blurbEs)},
    },
    d: '${r.data}',
  },`;
}).join('\n');

const out = `/**
 * slopes-data.js — frontiers that cross a hillside. GENERATED by
 * tools/build-slopes.mjs from public-domain elevation models; do not edit by
 * hand. See find-frontiers.mjs for how the windows are chosen.
 *
 * Same shape as borders-data.js, with two differences that matter:
 *
 *   halfX and halfY instead of half. The window is a rectangle whose length
 *   runs along the frontier — where kilometres are free — and whose depth runs
 *   across it, where they are not. That is what buys a window tens of
 *   kilometres wide in which seventy per cent of the ground is still feasible.
 *
 *   kind: 'slope'. The frontier here does not pass through the peak. It cuts a
 *   slope below one, so the highest legal point is somewhere along the line and
 *   has to be found by walking it, and the peak stands in plain view inside the
 *   far third, off the line.
 *
 * Coordinates are kilometres east and north of the window's centre; heights
 * metres. The boundary travels as nx*x + ny*y = c with the country that owns
 * the peak at nx*x + ny*y > c.
 */
export const QUANTUM = ${QUANTUM};
export const SLOPES = {
${entries}
};
`;

const dest = join(here, '..', 'app', 'js', 'slopes-data.js');
writeFileSync(dest, out);
console.log(`\n${dest}  ${(out.length / 1024).toFixed(0)} KB, ${results.length} slopes,`
  + ` ${failures} rejected, ${fetched} tiles fetched`);
