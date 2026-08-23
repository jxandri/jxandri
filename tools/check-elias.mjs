/**
 * check-elias.mjs — the mountain is the mountain, and the lesson holds.
 *
 * Three kinds of claim, three kinds of check. That the data survived its
 * encoding: the decoded grid's summit must be the one the builder reported.
 * That the geography is right: the summit must sit on the Canadian side of
 * the fitted boundary line, a known distance off it, at a height within a few
 * per cent of the surveyed 5 489 m (a 150 m grid shaves summits — that is a
 * property of sampling, and the check allows exactly that much and no more).
 * And that the lesson is forced by the data rather than asserted by the note:
 * maximising the real elevation over the Alaska half-plane must land ON the
 * boundary line, strictly below the summit — the Lagrange picture, computed.
 *
 *   node tools/check-elias.mjs
 */

const { eliasHeight, ELIAS_INFO } = await import('../app/js/elias.js').catch(() => null)
  ?? await import(new URL('../app/js/elias.js', import.meta.url));
const { compile, compilePredicate } = await import(new URL('../app/js/mathexpr.js', import.meta.url));

let fails = 0;
const check = (n, ok, d) => { if (!ok) fails++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`); };

const B = ELIAS_INFO.boundary;
const lineY = (x) => B.m * x + B.b;

/* ------------------------------------------------------------- the data */

// Scan the whole window on the grid's own nodes (Catmull–Rom interpolates,
// so at a node the function value IS the datum).
let peak = -Infinity, px = 0, py = 0, low = Infinity;
for (let y = ELIAS_INFO.ymin; y <= ELIAS_INFO.ymax + 1e-9; y += 0.15) {
  for (let x = ELIAS_INFO.xmin; x <= ELIAS_INFO.xmax + 1e-9; x += 0.15) {
    const h = eliasHeight(x, y);
    if (h > peak) { peak = h; px = x; py = y; }
    if (h < low) low = h;
  }
}
check('the decoded grid reaches the height the builder wrote',
  Math.abs(peak * 1000 - ELIAS_INFO.peakMetres) < 0.5,
  `${(peak * 1000).toFixed(0)} m against ${ELIAS_INFO.peakMetres} m`);
check('the summit is where Mount Saint Elias is',
  Math.hypot(px, py) < 0.5,
  `grid summit at (${px.toFixed(2)}, ${py.toFixed(2)}) km from the surveyed coordinate`);
check('and as tall as the surveyed 5 489 m, less the sampling shave',
  peak * 1000 > 5489 * 0.97 && peak * 1000 <= 5489,
  `${(peak * 1000).toFixed(0)} m (${((peak * 1000 / 5489) * 100).toFixed(1)}% of surveyed)`);
check('the Pacific corner is at the sea', low < 0.02,
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

// Maximise over Alaska: brute-force at grid resolution, then confirm the
// winner hugs the line. The mountain's peak is across the frontier, so the
// constrained maximum has nowhere to be but the frontier.
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

// C¹: the finite-difference gradient along a line crossing many cells must
// vary continuously — bilinear sampling would jump at every cell edge.
let worst = 0, prev = null;
for (let t = -3; t <= 3; t += 0.003) {
  const g = (eliasHeight(t + 1e-4, -1.2) - eliasHeight(t - 1e-4, -1.2)) / 2e-4;
  if (prev !== null) worst = Math.max(worst, Math.abs(g - prev));
  prev = g;
}
check('the gradient is continuous across data cells (bicubic, not bilinear)',
  worst < 0.2, `largest slope step ${worst.toFixed(4)} between samples 3 m apart`);

console.log(fails === 0
  ? '\nTHE MOUNTAIN IS REAL, AND THE CONSTRAINED MAXIMUM IS ON THE FRONTIER'
  : `\n${fails} FAILURE(S)`);
process.exit(fails ? 1 : 0);
