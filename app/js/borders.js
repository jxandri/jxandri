/**
 * borders.js — mountains cut by an international boundary, as functions.
 *
 * Twelve real mountains from the border atlas, each one a bivariate function a
 * student can maximise. What makes them worth having is not the scenery: it is
 * that every one of them is a constrained-maximisation problem the world set
 * up on its own. A named summit sits inside one country; the frontier crosses
 * the mountain below it; so the highest point of the *other* country cannot be
 * the summit, and has to be somewhere on the line. That is a Lagrange
 * condition you can walk to, and the constraint is not a formula somebody
 * invented for a problem set — it is a treaty.
 *
 * Each mountain evaluates a finite cosine series (see elias.js for why a
 * finite sum of cosines rather than an interpolated grid: it is infinitely
 * differentiable, so gradients, tangent planes, geodesics and level curves are
 * all exact objects rather than artefacts of sampling). Coordinates are
 * kilometres east and north of the summit; the result is kilometres of
 * elevation.
 *
 * The boundary travels with the mountain as the line nx·x + ny·y = c, with the
 * summit's own country at nx·x + ny·y > c. The app takes the *other* side as
 * the feasible set, which is what forces the answer onto the frontier.
 *
 * Where the boundary comes from is worth stating, because it is the constraint
 * being taught: eight of these are the 49th parallel or the 141st meridian —
 * lines defined by a number, exact in local coordinates with no survey error to
 * inherit — and the rest are treaty straight lines reproduced from their own
 * defining endpoints. Nothing here is traced off a small-scale map.
 */

import { BORDERS as PEAKS, QUANTUM } from './borders-data.js';
import { SLOPES } from './slopes-data.js';

/**
 * Two families of the same lesson, in one table.
 *
 * The atlas mountains (borders-data.js) are frontiers that cross a *summit*:
 * the peak is on the line, the country that does not own it is higher than the
 * line almost everywhere, and an honest window therefore shows a thin ribbon of
 * feasible ground. That is a true and vivid picture of one situation.
 *
 * The frontier slopes (slopes-data.js) are the other situation, and the more
 * common one: the line crosses a hillside below a peak. The feasible country
 * falls away from it for kilometres, so it can be seventy per cent of a window
 * ten times the area, the peak stands off the line in plain view, and the
 * highest legal point has to be found by walking the frontier rather than
 * guessed as the nearest point to the summit.
 *
 * Everything downstream — the evaluator, the constraint text, Border Run —
 * treats them identically, because mathematically they are identical.
 */
const BORDERS = { ...SLOPES, ...PEAKS };
export { BORDERS };

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const VALUE = (() => {
  const v = new Int8Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) v[ALPHABET.charCodeAt(i)] = i;
  return v;
})();

/** Coefficients, decoded on first use and kept. */
const decoded = new Map();
function coeffs(id) {
  let c = decoded.get(id);
  if (c) return c;
  const spec = BORDERS[id];
  const n = spec.M * spec.M;
  c = new Float64Array(n);
  const s = spec.d;
  let i = 0, k = 0;
  while (i < s.length && k < n) {
    let z = 0, shift = 1, ch;
    do {
      ch = VALUE[s.charCodeAt(i++)];
      z += (ch & 31) * shift;
      shift *= 32;
    } while (ch & 32);
    c[k++] = ((z & 1) ? -(z + 1) / 2 : z / 2) * QUANTUM;
  }
  decoded.set(id, c);
  return c;
}

/**
 * One evaluator per mountain, each with its own row cache.
 *
 * Callers are overwhelmingly row-coherent — meshes, detail rings and contour
 * grids all scan with y fixed — so for a fixed y the double sum collapses to a
 * single sum over x-modes and the M x M work is paid once per row. cos(n t)
 * comes from the Chebyshev recurrence rather than M calls into Math.cos.
 */
function makeEvaluator(id) {
  const spec = BORDERS[id];
  const { M } = spec;
  // Square windows write one half-width; the frontier slopes are rectangles,
  // long along the border and shallow across it, and write two. The index
  // space the transform lives in is square either way — it is only the map
  // from kilometres into it that differs per axis.
  const halfX = spec.halfX ?? spec.half;
  const halfY = spec.halfY ?? spec.half;
  const c = coeffs(id);
  const CJ = new Float64Array(M);
  const CK = new Float64Array(M);
  const D = new Float64Array(M);
  let cachedY = NaN;

  return (x, y) => {
    if (!(x >= -halfX && x <= halfX && y >= -halfY && y <= halfY)) return NaN;

    if (y !== cachedY) {
      const ty = Math.PI * (y + halfY) / (2 * halfY);
      CK[0] = 1;
      if (M > 1) CK[1] = Math.cos(ty);
      for (let k = 2; k < M; k++) CK[k] = 2 * CK[1] * CK[k - 1] - CK[k - 2];
      for (let j = 0; j < M; j++) {
        let s = 0;
        for (let k = 0; k < M; k++) s += c[k * M + j] * CK[k];
        D[j] = s;
      }
      cachedY = y;
    }

    const tx = Math.PI * (x + halfX) / (2 * halfX);
    CJ[0] = 1;
    if (M > 1) CJ[1] = Math.cos(tx);
    for (let j = 2; j < M; j++) CJ[j] = 2 * CJ[1] * CJ[j - 1] - CJ[j - 2];

    let v = 0;
    for (let j = 0; j < M; j++) v += D[j] * CJ[j];
    return v / 1000;
  };
}

const evaluators = new Map();
function evaluatorFor(id) {
  let f = evaluators.get(id);
  if (!f) { f = makeEvaluator(id); evaluators.set(id, f); }
  return f;
}

/** The math-function table entries: one `<id>(x, y)` per mountain. */
export const BORDER_FUNCS = {};
for (const id of Object.keys(BORDERS)) {
  BORDER_FUNCS[id] = [2, 2, (x, y) => (isFinite(x) && isFinite(y) ? evaluatorFor(id)(x, y) : NaN)];
}

export const BORDER_IDS = Object.keys(BORDERS);

/** Everything the app needs to set a mountain up, without touching the data. */
export function borderInfo(id) {
  const s = BORDERS[id];
  if (!s) return null;
  return {
    ...s, d: undefined,
    halfX: s.halfX ?? s.half,
    halfY: s.halfY ?? s.half,
  };
}

/** The window, as the domain boxes want it. */
export function windowOf(id) {
  const s = BORDERS[id];
  if (!s) return null;
  const hx = s.halfX ?? s.half, hy = s.halfY ?? s.half;
  return { xmin: -hx, xmax: hx, ymin: -hy, ymax: hy };
}

/** Which family an example belongs to, for the menu and the notes. */
export const SLOPE_IDS = Object.keys(BORDERS).filter((id) => BORDERS[id].kind === 'slope');
export const PEAK_IDS = Object.keys(BORDERS).filter((id) => BORDERS[id].kind !== 'slope');

/**
 * The feasible set — the country that does NOT own the summit — as a formula a
 * student can read in the box and edit.
 *
 * A parallel or a meridian comes out as `y >= 1.2` or `x <= -3.4`, which is
 * what it is. A treaty line comes out as a genuine linear inequality in both
 * variables. Either way what appears in the constraint box is the frontier
 * itself, written the way an economics course writes a budget line.
 */
export function feasibleFor(id) {
  const s = BORDERS[id];
  if (!s) return '';
  const { nx, ny, c } = s.line;
  const r = (v) => {
    const t = Number(v.toFixed(4));
    return Object.is(t, -0) ? '0' : String(t);
  };
  if (Math.abs(nx) < 1e-9) {
    return ny > 0 ? `y <= ${r(c / ny)}` : `y >= ${r(c / ny)}`;
  }
  if (Math.abs(ny) < 1e-9) {
    return nx > 0 ? `x <= ${r(c / nx)}` : `x >= ${r(c / nx)}`;
  }
  // Normalise so the reader sees a unit coefficient on y where possible.
  if (ny > 0) return `${r(nx / ny)}*x + y <= ${r(c / ny)}`;
  return `${r(nx / -ny)}*x - y <= ${r(c / -ny)}`;
}

/** The boundary line, for drawing it and for walking along it. */
export function boundaryOf(id) {
  const s = BORDERS[id];
  return s ? { ...s.line } : null;
}
