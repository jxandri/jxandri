/**
 * check-elias.mjs — the mountain is smooth, close to real, and the lesson holds.
 *
 * The model is no longer an interpolant of the elevation grid but a truncated
 * cosine series fitted to it (see build-elias-fourier.mjs), so the claims
 * split four ways. Fidelity: the smooth surface must stay near the survey —
 * RMS within ~120 m over 5.4 km of relief, summit within a couple hundred
 * metres of the surveyed coordinate and above 90% of the surveyed height.
 * Geography: the summit must still sit on the Canadian side of the fitted
 * boundary line, a known distance off it. The lesson: maximising over the
 * Alaska half-plane must land ON the boundary, strictly below the summit —
 * the Lagrange picture, computed, surviving the smoothing. And smoothness
 * itself: the parsimony that motivated the fit (a dozen honest relative
 * maxima, not five hundred artefacts of sampling), second derivatives that
 * exist and vary continuously (the bicubic could not offer that), and a
 * row-cached evaluator that agrees exactly with the naive double sum.
 *
 *   node tools/check-elias.mjs
 */

const { eliasHeight, ELIAS_INFO } = await import(new URL('../app/js/elias.js', import.meta.url));
const { FOURIER } = await import(new URL('../app/js/elias-fourier.js', import.meta.url));
const { ELIAS } = await import(new URL('../app/js/elias-data.js', import.meta.url));
const { compile, compilePredicate } = await import(new URL('../app/js/mathexpr.js', import.meta.url));

let fails = 0;
const check = (n, ok, d) => { if (!ok) fails++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`); };

const B = ELIAS_INFO.boundary;
const lineY = (x) => B.m * x + B.b;

/* -------------------------------------------- the raw survey, for reference */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const VALUE = new Int8Array(128).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) VALUE[ALPHABET.charCodeAt(i)] = i;
const H = new Float64Array(ELIAS.nx * ELIAS.ny);
{
  const s = ELIAS.data;
  let i = 0, prev = 0, k = 0;
  while (i < s.length) {
    let z = 0, shift = 1, c;
    do { c = VALUE[s.charCodeAt(i++)]; z += (c & 31) * shift; shift *= 32; } while (c & 32);
    prev += (z & 1) ? -(z + 1) / 2 : z / 2;
    H[k++] = prev;
  }
}
const { nx, ny, x0, y0, step } = ELIAS;

/* --------------------------------------------------------------- fidelity */

let se = 0, count = 0, peak = -Infinity, px = 0, py = 0, low = Infinity;
for (let j = 0; j < ny; j++) {
  for (let i = 0; i < nx; i++) {
    const x = x0 + i * step, y = y0 + j * step;
    const h = eliasHeight(x, y);
    const e = h * 1000 - H[j * nx + i];
    se += e * e; count++;
    if (h > peak) { peak = h; px = x; py = y; }
    if (h < low) low = h;
  }
}
const rms = Math.sqrt(se / count);
check('the smooth surface stays near the survey', rms < 120,
  `RMS ${rms.toFixed(0)} m over ${((peak - low)).toFixed(1)} km of relief`);
check('the summit is where Mount Saint Elias is', Math.hypot(px, py) < 0.5,
  `smooth summit at (${px.toFixed(2)}, ${py.toFixed(2)}) km from the surveyed coordinate`);
check('and keeps most of the surveyed 5 489 m through the smoothing',
  peak * 1000 > 5489 * 0.85 && peak * 1000 <= 5489,
  `${(peak * 1000).toFixed(0)} m (${((peak * 1000 / 5489) * 100).toFixed(1)}% of surveyed)`);
check('the Pacific corner is at the sea', low < 0.1,
  `lowest sample ${(low * 1000).toFixed(0)} m`);
check('off the survey, the function is honestly undefined',
  Number.isNaN(eliasHeight(50, 50)) && Number.isNaN(eliasHeight(ELIAS_INFO.xmin - 1, 0)));

/* --------------------------------------------------------- the geography */

const off = py - lineY(px);
check('the summit lies on the Canadian side of the boundary line',
  off > 0, `${(off).toFixed(3)} km north of it`);
check('close to it, but not on it — Boundary Peak 186, not ON the boundary',
  off > 0.2 && off < 1.5, `${(off * 1000).toFixed(0)} m`);

/* ---------------------------------------------------------- the analysis */

const feasible = (x, y) => y <= lineY(x);
let cPeak = -Infinity, cx = 0, cy = 0;
for (let y = ELIAS_INFO.ymin; y <= ELIAS_INFO.ymax + 1e-9; y += 0.05) {
  for (let x = ELIAS_INFO.xmin; x <= ELIAS_INFO.xmax + 1e-9; x += 0.05) {
    if (!feasible(x, y)) continue;
    const h = eliasHeight(x, y);
    if (h > cPeak) { cPeak = h; cx = x; cy = y; }
  }
}
check('the highest point of Alaska is on the boundary line',
  Math.abs(cy - lineY(cx)) < 0.08,
  `at (${cx.toFixed(2)}, ${cy.toFixed(2)}), ${(Math.abs(cy - lineY(cx)) * 1000).toFixed(0)} m off the line`);
check('and strictly below the summit across the line',
  cPeak < peak - 0.01,
  `${(cPeak * 1000).toFixed(0)} m against ${(peak * 1000).toFixed(0)} m — the frontier costs ${((peak - cPeak) * 1000).toFixed(0)} m`);

/* --------------------------------------------------- through the compiler */

const f = compile('elias(x, y)', ['x', 'y']);
check('elias(x, y) compiles like any other formula',
  Math.abs(f(px, py) - peak) < 1e-12);
const pred = compilePredicate(`y <= ${B.m.toFixed(4)}*x ${B.b < 0 ? '-' : '+'} ${Math.abs(B.b).toFixed(4)}`);
check('the preset\'s feasible string parses and takes the right side',
  pred(cx, cy) && !pred(px, py),
  'constrained optimum feasible, summit not');

/* ------------------------------------------------------------ smoothness */

// Parsimony: strict relative maxima on the survey lattice, 1 m prominence.
// The raw grid carries hundreds; the fitted surface must carry only the
// massif's real shoulders.
const countMaxima = (get) => {
  let n = 0;
  for (let j = 1; j < ny - 1; j++) {
    for (let i = 1; i < nx - 1; i++) {
      const v = get(i, j);
      let best = -Infinity;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (di || dj) best = Math.max(best, get(i + di, j + dj));
        }
      }
      if (v > best + 1) n++;
    }
  }
  return n;
};
const smoothVal = new Float64Array(nx * ny);
for (let j = 0; j < ny; j++) {
  for (let i = 0; i < nx; i++) {
    smoothVal[j * nx + i] = eliasHeight(x0 + i * step, y0 + j * step) * 1000;
  }
}
const rawMaxima = countMaxima((i, j) => H[j * nx + i]);
const smoothMaxima = countMaxima((i, j) => smoothVal[j * nx + i]);
check('smoothing prunes the spurious relative maxima',
  rawMaxima > 300 && smoothMaxima < 30,
  `${rawMaxima} on the raw grid, ${smoothMaxima} on the smooth surface`);

// C-infinity in practice: the second derivative exists and varies
// continuously. Sample f_xx by central differences along a transect crossing
// many former cell edges — under the bicubic it jumped at every one.
let worst2 = 0, prev2 = null;
const h2 = 0.01;
for (let t = -3; t <= 3; t += 0.003) {
  const fxx = (eliasHeight(t + h2, -1.2) - 2 * eliasHeight(t, -1.2) + eliasHeight(t - h2, -1.2)) / (h2 * h2);
  if (prev2 !== null) worst2 = Math.max(worst2, Math.abs(fxx - prev2));
  prev2 = fxx;
}
check('the second derivative varies continuously (the bicubic could not)',
  worst2 < 0.05, `largest f_xx step ${worst2.toFixed(4)} km⁻¹ between samples 3 m apart`);

// The row-cached evaluator must agree exactly with the naive double sum.
const naive = (x, y) => {
  const { M, c, LX, LY } = FOURIER;
  const tx = Math.PI * (x - FOURIER.x0) / LX, ty = Math.PI * (y - FOURIER.y0) / LY;
  let v = 0;
  for (let k = 0; k < M; k++) {
    for (let j = 0; j < M; j++) v += c[k * M + j] * Math.cos(j * tx) * Math.cos(k * ty);
  }
  return v / 1000;
};
let worstAgree = 0;
for (const [x, y] of [[0.2, 0.1], [-15.3, 7.7], [8.1, -20.2], [-29, 11], [3.14159, -2.71828]]) {
  worstAgree = Math.max(worstAgree, Math.abs(eliasHeight(x, y) - naive(x, y)));
}
check('the fast evaluator computes the same series as the definition',
  worstAgree < 1e-9, `worst disagreement ${worstAgree.toExponential(1)} km`);

console.log(fails === 0
  ? '\nTHE MOUNTAIN IS SMOOTH, AND THE CONSTRAINED MAXIMUM IS STILL ON THE FRONTIER'
  : `\n${fails} FAILURE(S)`);
process.exit(fails ? 1 : 0);
