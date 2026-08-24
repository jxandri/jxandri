/**
 * elias.js — Mount Saint Elias as a smooth function of two variables.
 *
 * The rest of the program never asks a surface to be a formula — it asks it to
 * be a function it can call: gradients are central differences, contours are
 * marching squares, the optimiser is a pattern search. So a real mountain can
 * be a "bivariate function" in the fullest sense, provided calling it at a
 * point returns a height: elias(x, y), with x km east and y km north of the
 * summit, returning kilometres of elevation, defined on the 40 km window the
 * survey covers and NaN outside it — which the program already treats,
 * correctly, as "the function is not defined here".
 *
 * What the call evaluates is not the elevation grid but a finite cosine
 * series fitted to it (elias-fourier.js, made by tools/build-elias-fourier.mjs
 * from the raw data in elias-data.js). The distinction is the whole point.
 * Interpolating the grid — as this module once did, bicubically — reproduces
 * every sample, and with it every artefact of sampling: hundreds of relative
 * maxima at the scale of a pixel, and a function differentiable exactly once.
 * A finite sum of cosines is instead infinitely differentiable — an entire
 * function — with derivatives of every order defined everywhere. Gradients
 * vary smoothly, level curves are differentiable curves, tangent planes exist
 * at every point, geodesics solve a smooth equation; and the surface carries
 * a dozen honest relative maxima (the real shoulders of the massif) rather
 * than five hundred spurious ones. It sits within ~93 m RMS of the survey
 * over 5 km of relief. The crags and ice the eye sees on screen are the
 * decoration standing on the surface, not the function: mathematically the
 * mountain is as smooth as any formula in the preset list.
 *
 * Evaluation is cheap because callers are almost always row-coherent (meshes,
 * detail rings and contour grids all scan with y fixed): for a fixed y the
 * double sum collapses to a single sum over x-modes,
 *
 *     f(x, y) = Σ_j D_j(y) cos(π j u),   D_j = Σ_k c_jk cos(π k v),
 *
 * so the M×M work is paid once per new y and each call in the row costs M
 * multiplies. cos(n t) comes from the Chebyshev recurrence, not M calls into
 * Math.cos.
 */

import { FOURIER } from './elias-fourier.js';

const { M, x0, y0, LX, LY, c } = FOURIER;

const CJ = new Float64Array(M);   // cos(π j u) for the current x
const CK = new Float64Array(M);   // cos(π k v) for the cached y
const D = new Float64Array(M);    // the collapsed x-series for the cached y
let cachedY = NaN;

/**
 * The mountain: elevation in kilometres at (x, y) kilometres from the summit.
 * NaN outside the data window — the surface simply ends where the survey does.
 */
export function eliasHeight(x, y) {
  if (!(x >= x0 && x <= x0 + LX && y >= y0 && y <= y0 + LY)) return NaN;

  if (y !== cachedY) {
    const ty = Math.PI * (y - y0) / LY;
    CK[0] = 1;
    CK[1] = Math.cos(ty);
    for (let k = 2; k < M; k++) CK[k] = 2 * CK[1] * CK[k - 1] - CK[k - 2];
    for (let j = 0; j < M; j++) {
      let s = 0;
      for (let k = 0; k < M; k++) s += c[k * M + j] * CK[k];
      D[j] = s;
    }
    cachedY = y;
  }

  const tx = Math.PI * (x - x0) / LX;
  CJ[0] = 1;
  CJ[1] = Math.cos(tx);
  for (let j = 2; j < M; j++) CJ[j] = 2 * CJ[1] * CJ[j - 1] - CJ[j - 2];

  let v = 0;
  for (let j = 0; j < M; j++) v += D[j] * CJ[j];
  return v / 1000;
}

/** The window, the peaks, and the boundary fit — for the preset and the tests. */
export const ELIAS_INFO = {
  xmin: x0,
  xmax: x0 + LX,
  ymin: y0,
  ymax: y0 + LY,
  peakMetres: FOURIER.peak,        // the real mountain's surveyed summit
  summit: FOURIER.summit,          // the smooth model's summit
  boundary: FOURIER.boundary,
};
