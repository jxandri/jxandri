/**
 * elias.js — Mount Saint Elias as a function of two variables.
 *
 * The rest of the program never asks a surface to be a formula — it asks it to
 * be a function it can call: gradients are central differences, contours are
 * marching squares, the optimiser is a pattern search. So a real mountain can
 * be a "bivariate function" in the fullest sense, provided calling it at a
 * point returns a height. This module turns the baked elevation grid of
 * elias-data.js into exactly that: elias(x, y), with x km east and y km north
 * of the summit, returning kilometres of elevation, defined on the 40 km
 * window the data covers and NaN outside it — which the program already
 * treats, correctly, as "the function is not defined here".
 *
 * Sampling is bicubic (Catmull–Rom), not bilinear, for one reason: the
 * Derivatives section. A bilinear surface has a piecewise-constant gradient —
 * jumping at every cell edge — and the gizmos that draw ∂f/∂x and ∇f would
 * visibly stutter as the explorer walked across cells. Catmull–Rom
 * interpolation passes through every data point and is C¹ across cells, so
 * the gradient the arrows show varies continuously, like the mountain it
 * belongs to.
 *
 * Everything here is derived from public-domain data; see elias-data.js for
 * provenance and tools/build-elias.mjs for how it was made.
 */

import { ELIAS } from './elias-data.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const VALUE = (() => {
  const v = new Int8Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) v[ALPHABET.charCodeAt(i)] = i;
  return v;
})();

/** The grid, decoded once on first use: metres, row-major, south row first. */
let H = null;
function grid() {
  if (H) return H;
  const s = ELIAS.data;
  H = new Float64Array(ELIAS.nx * ELIAS.ny);
  let i = 0, prev = 0, k = 0;
  while (i < s.length) {
    let z = 0, shift = 1, c;
    do {
      c = VALUE[s.charCodeAt(i++)];
      z += (c & 31) * shift;
      shift *= 32;
    } while (c & 32);
    prev += (z & 1) ? -(z + 1) / 2 : z / 2;
    H[k++] = prev;
  }
  return H;
}

/** Grid value with clamped indices, so the edge rows serve as their own
 *  neighbours — the standard boundary treatment for interpolation. */
function at(i, j) {
  const ii = i < 0 ? 0 : i >= ELIAS.nx ? ELIAS.nx - 1 : i;
  const jj = j < 0 ? 0 : j >= ELIAS.ny ? ELIAS.ny - 1 : j;
  return H[jj * ELIAS.nx + ii];
}

/** Catmull–Rom through four samples, evaluated at t in [0, 1]. */
function cr(p0, p1, p2, p3, t) {
  return 0.5 * (2 * p1
    + t * ((p2 - p0)
      + t * ((2 * p0 - 5 * p1 + 4 * p2 - p3)
        + t * (3 * (p1 - p2) + p3 - p0))));
}

/**
 * The mountain: elevation in kilometres at (x, y) kilometres from the summit.
 * NaN outside the data window — the surface simply ends where the survey does.
 */
export function eliasHeight(x, y) {
  if (!isFinite(x) || !isFinite(y)) return NaN;
  const fx = (x - ELIAS.x0) / ELIAS.step;
  const fy = (y - ELIAS.y0) / ELIAS.step;
  if (fx < 0 || fy < 0 || fx > ELIAS.nx - 1 || fy > ELIAS.ny - 1) return NaN;
  grid();

  const i = Math.min(ELIAS.nx - 2, Math.floor(fx));
  const j = Math.min(ELIAS.ny - 2, Math.floor(fy));
  const tx = fx - i, ty = fy - j;

  // Four rows of Catmull–Rom in x, then one in y: separable bicubic.
  const r0 = cr(at(i - 1, j - 1), at(i, j - 1), at(i + 1, j - 1), at(i + 2, j - 1), tx);
  const r1 = cr(at(i - 1, j), at(i, j), at(i + 1, j), at(i + 2, j), tx);
  const r2 = cr(at(i - 1, j + 1), at(i, j + 1), at(i + 1, j + 1), at(i + 2, j + 1), tx);
  const r3 = cr(at(i - 1, j + 2), at(i, j + 2), at(i + 1, j + 2), at(i + 2, j + 2), tx);
  return cr(r0, r1, r2, r3, ty) / 1000;
}

/** The window, the peak, and the boundary fit — for the preset and the tests. */
export const ELIAS_INFO = {
  xmin: ELIAS.x0,
  xmax: ELIAS.x0 + (ELIAS.nx - 1) * ELIAS.step,
  ymin: ELIAS.y0,
  ymax: ELIAS.y0 + (ELIAS.ny - 1) * ELIAS.step,
  peakMetres: ELIAS.peak,
  boundary: ELIAS.boundary,
};
