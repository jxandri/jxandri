/**
 * build-elias-fourier.mjs — fit Mount Saint Elias with a C-infinity function.
 *
 * The bicubic model interpolated every sample of the 150 m elevation grid.
 * That is faithful, but it is faithful to the *sampling*: it reproduces every
 * pixel-scale wiggle as a genuine feature of f, so the surface carried
 * hundreds of relative maxima that are artefacts of resolution, and it was
 * only C¹ — differentiable once, with a second derivative that jumped at
 * every cell edge.
 *
 * This tool replaces interpolation with approximation: a truncated cosine
 * series (a two-dimensional Fourier fit),
 *
 *     f(x, y) = Σ_{j<M} Σ_{k<M} c_jk · w_jk · cos(π j u) cos(π k v),
 *
 * with u, v the window coordinates in [0, 1] and w a Gaussian taper
 * exp(−(j²+k²)/2σ²) that rolls the spectrum off smoothly (a hard cutoff
 * would ring — Gibbs ripples are spurious extrema by another name). A finite
 * sum of cosines is entire: infinitely differentiable, with exact analytic
 * derivatives of every order. Gradients, tangent planes, geodesics, level
 * curves and the optimiser all operate on a genuinely smooth f, and what
 * roughness the eye sees on screen is decoration standing on it, not the
 * function.
 *
 * The truncation M = 80, σ = 22 was chosen by sweeping and measuring three
 * things at once: closeness (RMS ≈ 93 m over a 5.4 km relief), honesty of the
 * lesson (the summit stays north of the boundary and the constrained maximum
 * stays ON the line), and parsimony (15 relative maxima on the whole massif —
 * real shoulders of the range — against 513 in the raw grid).
 *
 *   node tools/build-elias-fourier.mjs      → writes app/js/elias-fourier.js
 */

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ELIAS } from '../app/js/elias-data.js';

const M = 80;         // modes kept per axis
const SIGMA = 22;     // Gaussian taper width, in modes

/* ---------------------------------------------------- decode the raw grid */
// Same varint scheme elias.js used when it read the grid directly; the raw
// data is a build-time input now, so the decoder lives with the build.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const VALUE = new Int8Array(128).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) VALUE[ALPHABET.charCodeAt(i)] = i;

const { nx, ny, x0, y0, step } = ELIAS;
const H = new Float64Array(nx * ny);
{
  const s = ELIAS.data;
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
}

/* --------------------------------------------------------- DCT-I analysis */
function dct1(vec) {
  const N = vec.length, out = new Float64Array(N);
  for (let j = 0; j < N; j++) {
    let s = 0.5 * (vec[0] + (j % 2 ? -1 : 1) * vec[N - 1]);
    for (let i = 1; i < N - 1; i++) s += vec[i] * Math.cos(Math.PI * j * i / (N - 1));
    out[j] = (2 / (N - 1)) * s;
  }
  return out;
}

console.log('analysing the grid…');
const rows = new Array(ny);
for (let j = 0; j < ny; j++) rows[j] = dct1(H.subarray(j * nx, (j + 1) * nx));

// Tapered, truncated coefficients, flat as c[k * M + j] (k: y-mode, j: x-mode)
// with the DCT-I synthesis halves for j = 0 / k = 0 folded in, so the runtime
// is a plain double sum.
const c = new Float64Array(M * M);
{
  const col = new Float64Array(ny);
  for (let j = 0; j < M; j++) {
    for (let k = 0; k < ny; k++) col[k] = rows[k][j];
    const ck = dct1(col);
    for (let k = 0; k < M; k++) {
      const w = Math.exp(-(j * j + k * k) / (2 * SIGMA * SIGMA));
      c[k * M + j] = ck[k] * w * (j === 0 ? 0.5 : 1) * (k === 0 ? 0.5 : 1);
    }
  }
}

/* ------------------------------------------------- evaluate and audit it */
const LX = (nx - 1) * step, LY = (ny - 1) * step;
const cj = new Float64Array(M), ck = new Float64Array(M);
const f = (x, y) => {
  const tx = Math.PI * (x - x0) / LX, ty = Math.PI * (y - y0) / LY;
  cj[0] = 1; ck[0] = 1;
  cj[1] = Math.cos(tx); ck[1] = Math.cos(ty);
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
  return v;                                            // metres
};

// RMS against the data
let se = 0, n = 0;
for (let j = 0; j < ny; j += 2) {
  for (let i = 0; i < nx; i += 2) {
    const e = f(x0 + i * step, y0 + j * step) - H[j * nx + i];
    se += e * e; n++;
  }
}
const rms = Math.sqrt(se / n);

// summit, by pattern search from the lattice argmax
let sx = 0, sy = 0, sv = -Infinity;
for (let j = 0; j < ny; j++) {
  for (let i = 0; i < nx; i++) {
    const v = f(x0 + i * step, y0 + j * step);
    if (v > sv) { sv = v; sx = x0 + i * step; sy = y0 + j * step; }
  }
}
for (let stp = step; stp > 1e-6;) {
  let moved = false;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const v = f(sx + dx * stp, sy + dy * stp);
    if (v > sv) { sv = v; sx += dx * stp; sy += dy * stp; moved = true; }
  }
  if (!moved) stp /= 2;
}

const { m, b } = ELIAS.boundary;
const northOfLine = sy > m * sx + b;
console.log(`rms ${rms.toFixed(0)} m; summit ${sv.toFixed(0)} m at ` +
  `(${sx.toFixed(2)}, ${sy.toFixed(2)}), ${northOfLine ? 'north' : 'SOUTH'} of the boundary`);
if (!northOfLine) throw new Error('the smooth summit crossed the boundary — retune M/SIGMA');

/* ----------------------------------------------------------------- emit */
const round = (v) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? 0 : r;
};
const nums = Array.from(c, round).join(',');
const out = `/**
 * elias-fourier.js — Mount Saint Elias as a finite cosine series. GENERATED
 * by tools/build-elias-fourier.mjs from the elevation grid in elias-data.js;
 * do not edit by hand — retune and rerun the tool.
 *
 * f(x, y) = Σ c[k·M+j] · cos(π j (x−x0)/LX) · cos(π k (y−y0)/LY), in metres,
 * with a Gaussian roll-off (σ = ${SIGMA} modes) already folded into c. A finite
 * sum of cosines is infinitely differentiable, so every derivative the program
 * takes of this mountain exists exactly. RMS distance to the survey data:
 * ${rms.toFixed(0)} m over ${(sv / 1000).toFixed(1)} km of relief; smooth summit ${sv.toFixed(0)} m at
 * (${sx.toFixed(2)}, ${sy.toFixed(2)}) km — still north of the 1903 boundary, so the
 * constrained-maximisation lesson is unchanged.
 */
export const FOURIER = {
  M: ${M},
  x0: ${x0}, y0: ${y0}, LX: ${round(LX)}, LY: ${round(LY)},
  peak: ${ELIAS.peak},
  summit: { x: ${sx.toFixed(4)}, y: ${sy.toFixed(4)}, metres: ${sv.toFixed(1)} },
  boundary: ${JSON.stringify(ELIAS.boundary)},
  c: new Float64Array([${nums}]),
};
`;
const dest = join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'js', 'elias-fourier.js');
await writeFile(dest, out);
console.log(`${dest}  ${(out.length / 1024).toFixed(0)} KB, ${M * M} coefficients`);
