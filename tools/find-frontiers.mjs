/**
 * find-frontiers.mjs — search a border for the stretches worth teaching.
 *
 * The atlas mountains were chosen the other way round: start from a named
 * summit that a frontier crosses, then find a window around it. That produces a
 * true and vivid lesson and one bad picture. Because the summit sits *on* the
 * line, the country that does not own it is higher than the line everywhere
 * except in a thin ribbon beside it — so the honest window shows a few hundred
 * metres of the feasible country and kilometres of the country you are barred
 * from. American Border Peak is the extreme case: three hundred metres north of
 * the 49th parallel the Canadian ground already stands 55 m above the best point
 * on the line, and three kilometres north there is a 2 398 m summit. No window
 * there can be two-thirds feasible and still true.
 *
 * This searches for the opposite configuration, which is the one the request
 * asks for: a stretch where the frontier crosses a *slope* rather than a
 * summit. Then
 *
 *   the feasible side falls away from the line for kilometres, so it can be
 *   most of the frame;
 *
 *   the highest point you may stand on is genuinely on the frontier, and you
 *   have to walk along the line to find where — which is a better problem than
 *   the original, because the answer is not simply "the nearest point to the
 *   peak";
 *
 *   and the peak you cannot have stands *inside* the far third, off the line,
 *   in plain view. The border does not pass through it. That is the whole
 *   difference.
 *
 * The search is over position, not over mountains. A parallel and a meridian
 * are defined by a number, so they can be walked from end to end: slide a
 * window along, ask the elevation model the four questions below, and keep what
 * passes. Nothing here needs a gazetteer, which is just as well — the summits
 * it finds are mostly unnamed shoulders, and naming them from coordinates would
 * be inventing geography.
 *
 * Usage:
 *   node tools/find-frontiers.mjs                    every border below
 *   node tools/find-frontiers.mjs --border p49       just one
 *   node tools/find-frontiers.mjs --top 8            how many to report
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

/** Nearest-sample elevation. The search only needs to rank windows. */
async function elev(z, lon, lat) {
  const [xr, yr] = tileXY(lon, lat, z);
  const gx = Math.round(xr * 256), gy = Math.round(yr * 256);
  const png = await tile(z, Math.floor(gx / 256), Math.floor(gy / 256));
  const i = ((gy - Math.floor(gy / 256) * 256) * 256 + (gx - Math.floor(gx / 256) * 256)) * 4;
  const d = png.data;
  return d[i] * 256 + d[i + 1] + d[i + 2] / 256 - 32768;
}

/* --------------------------------------------------------- the borders */

/**
 * Straight borders defined by a number, with the span worth walking.
 *
 * `along` is the coordinate that runs along the line and `across` the one that
 * crosses it, so a parallel and a meridian are the same problem with the axes
 * swapped. Only lines with real relief on them are here: the 49th parallel is
 * 2 000 km long and most of it is prairie.
 */
const BORDERS = {
  p49w: {
    label: 'the 49th parallel north', labelEs: 'el paralelo 49 norte',
    kind: 'parallel', value: 49,
    countries: ['United States', 'Canada'], countriesEs: ['Estados Unidos', 'Canadá'],
    from: -123.0, to: -114.0,          // Cascades, Selkirks, Purcells, Rockies
  },
  m141: {
    label: 'the 141st meridian west', labelEs: 'el meridiano 141 oeste',
    kind: 'meridian', value: -141,
    countries: ['United States', 'Canada'], countriesEs: ['Estados Unidos', 'Canadá'],
    from: 60.3, to: 69.6,              // the St Elias massif north to the Ogilvies
  },
};

/* ------------------------------------------------------------ scoring */

const FEASIBLE_SHARE = 0.70;           // of the window, by area
const ON_LINE_TOL = 15;                // m: how far the interior may beat the line
const PRIZE_MIN = 80;                  // m: the peak must be worth wanting
const RELIEF_MIN = 350;                // m: it has to be a mountain
const EDGE = 0.15;                     // keep the interesting points off the edges

/**
 * Read one candidate window and answer the four questions.
 *
 * The window is 2b along the frontier by (D + U) across it, with the line
 * inside it: D of the feasible country, U of the country that owns the peak,
 * and D/(D+U) = FEASIBLE_SHARE by construction.
 */
async function score(border, centre, b, U, z) {
  const D = U * FEASIBLE_SHARE / (1 - FEASIBLE_SHARE);
  const parallel = border.kind === 'parallel';
  const latRef = parallel ? border.value : centre;
  const KX = kxAt(latRef);

  // Sampling: about 70 m, which is as fine as this search needs.
  const stepA = (2 * b) / 200, stepC = (D + U) / 90;

  // Which side is higher gets to own the peak; the other is the feasible one.
  // Decided from the model, not from a claim, and re-decided for every window.
  const at = async (a, c) => {                 // a along the line, c across it
    if (parallel) {
      return elev(z, centre + a / KX, border.value + c / KY);
    }
    return elev(z, border.value + c / kxAt(centre + a / KY), centre + a / KY);
  };

  let hiN = -Infinity, hiS = -Infinity;
  for (let a = -b; a <= b; a += stepA * 4) {
    for (let k = 1; k <= 12; k++) {
      const c = (k / 12) * Math.max(D, U);
      hiN = Math.max(hiN, await at(a, c));
      hiS = Math.max(hiS, await at(a, -c));
    }
  }
  if (!isFinite(hiN) || !isFinite(hiS)) return null;
  const sign = hiN > hiS ? 1 : -1;             // +1: the peak's country is at +c

  let onLine = -Infinity, onLineAt = 0;
  let inFeas = -Infinity, inFeasAt = [0, 0];
  let prize = -Infinity, prizeAt = [0, 0];
  let lo = Infinity, hi = -Infinity;

  for (let a = -b; a <= b + 1e-9; a += stepA) {
    for (let c = -D; c <= U + 1e-9; c += stepC) {
      const cc = sign * c;                     // c > 0 is the peak's country
      const h = await at(a, cc);
      if (!isFinite(h)) return null;
      lo = Math.min(lo, h); hi = Math.max(hi, h);
      if (Math.abs(c) < stepC * 0.75) {
        if (h > onLine) { onLine = h; onLineAt = a; }
      } else if (c < 0) {
        if (h > inFeas) { inFeas = h; inFeasAt = [a, c]; }
      } else if (h > prize) { prize = h; prizeAt = [a, c]; }
    }
  }

  const relief = hi - lo;
  const interior = (a, c) => Math.abs(a) < b * (1 - EDGE)
    && c > D * EDGE * -1 && c < U * (1 - EDGE);

  const reasons = [];
  if (inFeas > onLine + ON_LINE_TOL) reasons.push(`interior beats the line by ${(inFeas - onLine).toFixed(0)} m`);
  if (prize < onLine + PRIZE_MIN) reasons.push(`nothing to want across it (+${(prize - onLine).toFixed(0)} m)`);
  if (relief < RELIEF_MIN) reasons.push(`flat (${relief.toFixed(0)} m of relief)`);
  if (Math.abs(onLineAt) > b * (1 - EDGE)) reasons.push('the best point on the line is at the edge');
  if (!interior(prizeAt[0], prizeAt[1])) reasons.push('the peak is cut by the edge');

  return {
    ok: reasons.length === 0, reasons,
    centre, b, U, D, sign, z,
    onLine, onLineAt, inFeas, prize, prizeAt, relief,
    margin: onLine - inFeas,               // how safely the line wins
    gain: prize - onLine,                  // what the frontier costs you
    areaKm2: 2 * b * (D + U),
  };
}

/* ---------------------------------------------------------------- run */

const args = process.argv.slice(2);
const only = args.includes('--border') ? args[args.indexOf('--border') + 1] : null;
const TOP = args.includes('--top') ? Number(args[args.indexOf('--top') + 1]) : 6;

// Wide and shallow first: the area comes from the length along the frontier,
// which costs nothing, while every extra kilometre *across* it is another
// chance to swallow a rival summit.
const PLANS = [];
for (const U of [1.2, 1.8, 2.5, 3.5, 4.5]) {
  for (const b of [16, 13, 11, 8, 6, 4.5, 3.2]) {
    if (b < U * 1.5) continue;               // keep it elongated along the line
    PLANS.push({ U, b });
  }
}
PLANS.sort((p, q) => (q.b * (q.U / (1 - FEASIBLE_SHARE))) - (p.b * (p.U / (1 - FEASIBLE_SHARE))));

const results = {};
for (const [id, border] of Object.entries(BORDERS)) {
  if (only && only !== id) continue;
  console.log(`\n=== ${border.label}  (${border.from} … ${border.to})`);
  const parallel = border.kind === 'parallel';
  // One sample every ~70 m at this latitude.
  const latRef = parallel ? border.value : (border.from + border.to) / 2;
  const z = Math.max(8, Math.min(13, Math.round(
    Math.log2((156543.03 * Math.cos((latRef * Math.PI) / 180)) / 70))));

  const unit = parallel ? kxAt(border.value) : KY;   // km per degree along
  const spanKm = Math.abs(border.to - border.from) * unit;
  const STEP = 3;                                    // km between candidates
  const n = Math.floor(spanKm / STEP);
  console.log(`  ${spanKm.toFixed(0)} km of frontier, ${n} candidate centres, DEM z${z}`);

  const found = [];
  for (let i = 0; i <= n; i++) {
    const centre = border.from + (Math.sign(border.to - border.from) * i * STEP) / unit;
    let best = null;
    for (const plan of PLANS) {
      const s = await score(border, centre, plan.b, plan.U, z);
      if (s && s.ok) { best = s; break; }            // widest plan that survives
    }
    if (best) found.push(best);
    if (i % 25 === 0) process.stdout.write(`  ${i}/${n} scanned, ${found.length} pass\r`);
  }
  console.log(`  ${found.length} of ${n + 1} centres carry an honest 70/30 window        `);

  // Keep the best, and keep them apart: two windows three kilometres apart are
  // the same mountain twice.
  found.sort((a, c) => (c.areaKm2 * c.gain) - (a.areaKm2 * a.gain));
  const kept = [];
  for (const f of found) {
    const unitK = parallel ? kxAt(border.value) : KY;
    if (kept.some((k) => Math.abs(k.centre - f.centre) * unitK < f.b * 1.6)) continue;
    kept.push(f);
    if (kept.length >= TOP) break;
  }
  results[id] = kept;

  for (const k of kept) {
    const where = parallel
      ? `${Math.abs(k.centre).toFixed(3)}°W`
      : `${Math.abs(k.centre).toFixed(3)}°${k.centre < 0 ? 'S' : 'N'}`;
    console.log(`  ${where.padEnd(10)} ${(2 * k.b).toFixed(0)} x ${(k.D + k.U).toFixed(1)} km`
      + ` (${k.areaKm2.toFixed(0)} km²) | line ${k.onLine.toFixed(0)} m,`
      + ` peak ${k.prize.toFixed(0)} m ${k.prizeAt[1].toFixed(1)} km across`
      + ` | frontier costs ${k.gain.toFixed(0)} m, margin ${k.margin.toFixed(0)} m`
      + ` | relief ${k.relief.toFixed(0)} m`);
  }
}

writeFileSync(join(here, '..', '.scratch', 'frontiers.json'),
  JSON.stringify(results, null, 1));
console.log(`\n${fetched} tiles fetched. Wrote .scratch/frontiers.json`);
