/**
 * check-borders.mjs — the border mountains are what they claim to be.
 *
 * The claim each of these examples makes is specific and checkable: a named
 * summit lies strictly inside one country, the international boundary crosses
 * the mountain below it, and therefore the highest point of the *other*
 * country is on the frontier rather than in its interior. That is the lesson,
 * and it is the thing that would quietly stop being true if a fit were
 * retuned, a window resized, or a boundary constant mistyped.
 *
 * So this re-derives all of it from the shipped data, with no reference to the
 * build tool: decode the coefficients, evaluate the surface, maximise freely
 * and under the constraint, and check the geometry. It also checks the parts a
 * student touches — that `<id>(x, y)` compiles like any other formula, that the
 * feasible-set string the preset writes really does select the other country,
 * and that every mountain has a photograph and a description to show.
 *
 *   node tools/check-borders.mjs
 */

const { BORDERS } = await import(new URL('../app/js/borders-data.js', import.meta.url));
const { feasibleFor, boundaryOf, BORDER_IDS } = await import(new URL('../app/js/borders.js', import.meta.url));
const { compile, compilePredicate } = await import(new URL('../app/js/mathexpr.js', import.meta.url));
const { photoFor } = await import(new URL('../app/js/borders-photos.js', import.meta.url));

let fails = 0;
const check = (n, ok, d) => { if (!ok) fails++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`); };

/**
 * The claim, tested directly rather than through an optimiser.
 *
 * "The constrained maximum lies on the frontier" is the statement that no
 * point strictly inside the feasible country beats the best point on the line.
 * Testing it by running a pattern search and looking at where it stopped
 * measures the search as much as the mountain — a search that gets stuck says
 * nothing about the geometry. So instead: scan the frontier densely for its
 * best point, scan the feasible interior densely for its best point at least
 * `depth` inside, and compare. That is the claim itself, and it cannot be
 * passed or failed by luck.
 */
function bestOnLine(f, L, half, n = 4000) {
  let best = -Infinity, bx = 0, by = 0;
  // The line as point + t·direction: the foot of the perpendicular from the
  // origin is (nx·c, ny·c), and (−ny, nx) runs along it.
  for (let i = 0; i <= n; i++) {
    const t = -half * 2 + (half * 4 * i) / n;
    const x = L.nx * L.c - L.ny * t;
    const y = L.ny * L.c + L.nx * t;
    if (Math.abs(x) > half || Math.abs(y) > half) continue;
    const v = f(x, y);
    if (isFinite(v) && v > best) { best = v; bx = x; by = y; }
  }
  return { x: bx, y: by, metres: best * 1000 };
}

function bestInside(f, L, half, depth, n = 260) {
  const side = (x, y) => L.nx * x + L.ny * y - L.c;
  let best = -Infinity, bx = 0, by = 0;
  for (let j = 0; j <= n; j++) {
    const y = -half + (2 * half * j) / n;
    for (let i = 0; i <= n; i++) {
      const x = -half + (2 * half * i) / n;
      if (side(x, y) > -depth) continue;          // not far enough inside
      const v = f(x, y);
      if (isFinite(v) && v > best) { best = v; bx = x; by = y; }
    }
  }
  return { x: bx, y: by, metres: best * 1000 };
}

check('twelve mountains shipped', BORDER_IDS.length === 12, `${BORDER_IDS.length}`);

let worstMargin = Infinity, worstGap = Infinity;
for (const id of BORDER_IDS) {
  const s = BORDERS[id];
  const f = compile(`${id}(x, y)`, ['x', 'y']);
  const L = boundaryOf(id);
  const side = (x, y) => L.nx * x + L.ny * y - L.c;
  const half = s.half;

  const own = side(0, 0);                       // the summit is at the origin
  const zTop = f(0, 0) * 1000;
  const line = bestOnLine(f, L, half);
  // At least 150 m inside the other country: deep enough that a point there is
  // unambiguously interior rather than a rounding of the frontier itself.
  const deep = bestInside(f, L, half, 0.15);
  const margin = line.metres - deep.metres;     // > 0 means the line wins

  worstMargin = Math.min(worstMargin, margin);
  worstGap = Math.min(worstGap, zTop - line.metres);

  const name = s.meta.name;
  const ok = own > 0
    && Math.abs(own - s.frontierKm) < 2e-3
    && margin > -5
    && line.metres < zTop - 1
    && Math.abs(zTop - s.summit.metres) < 4;
  check(`${name}`, ok,
    `summit ${zTop.toFixed(0)} m, ${own.toFixed(2)} km inside ${s.meta.countries[0].split(' (')[0]}`
    + ` | best in ${s.meta.countries[1].split(' (')[0]}: ${line.metres.toFixed(0)} m on the frontier,`
    + ` beating anything 150 m inside it by ${margin.toFixed(0)} m`);

  // The feasible string the preset writes must select the other country.
  const pred = compilePredicate(feasibleFor(id));
  const feasible = (x, y) => side(x, y) <= 0;
  // Sampled a clear 30 m either side of the frontier and out in both
  // countries, never exactly on the line: the string in the box carries
  // rounded constants, so a point sitting precisely on the boundary is a
  // coin toss for both of them and tests nothing.
  const off = 0.03;
  const probes = [[0, 0], [half * 0.5, half * 0.5], [-half * 0.5, -half * 0.5],
    [half * 0.3, -half * 0.7], [-half * 0.6, half * 0.2],
    [line.x - L.nx * off, line.y - L.ny * off],    // just inside the other country
    [line.x + L.nx * off, line.y + L.ny * off]];   // just inside the summit's own
  const agree = probes.every(([x, y]) => pred(x, y) === feasible(x, y));
  check(`  ${id}: the constraint in the box is the frontier`, agree, feasibleFor(id));

  // Off the window, honestly undefined — the survey has edges.
  check(`  ${id}: undefined beyond the window`,
    Number.isNaN(f(half * 1.2, 0)) && Number.isNaN(f(0, -half * 1.2)));

  // Something to show.
  const m = s.meta;
  check(`  ${id}: has a photograph and a description`,
    !!photoFor(id) && m.blurb.length > 40 && m.blurbEs.length > 40 && !!m.credit);
}

check('on every mountain the frontier beats the interior',
  worstMargin > -5, `worst margin ${worstMargin.toFixed(0)} m`);
check('and every constrained maximum is strictly below its summit',
  worstGap > 1, `smallest gap ${worstGap.toFixed(0)} m`);

// Smoothness: a finite cosine sum has continuous second derivatives, which the
// interpolated grid it replaced did not. One transect per mountain is enough
// to catch a decoder that has fallen out of step with the encoder.
let worst2 = 0;
for (const id of BORDER_IDS) {
  const s = BORDERS[id];
  const f = compile(`${id}(x, y)`, ['x', 'y']);
  const h = s.half * 0.004;
  let prev = null;
  for (let t = -s.half * 0.6; t <= s.half * 0.6; t += s.half * 0.004) {
    const fxx = (f(t + h, 0) - 2 * f(t, 0) + f(t - h, 0)) / (h * h);
    if (prev !== null) worst2 = Math.max(worst2, Math.abs(fxx - prev));
    prev = fxx;
  }
}
check('second derivatives vary continuously on every mountain',
  worst2 < 0.6, `largest step ${worst2.toFixed(3)} km⁻¹`);

console.log(fails === 0
  ? '\nTHE FRONTIER CUTS THE MOUNTAIN, AND THE BEST YOU CAN REACH IS ON THE LINE'
  : `\n${fails} FAILURE(S)`);
process.exit(fails ? 1 : 0);
