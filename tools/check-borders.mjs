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

// From borders.js, not borders-data.js: the table there is the union of the
// atlas mountains and the frontier slopes, and both families have to pass
// every claim below.
const { BORDERS, feasibleFor, boundaryOf, BORDER_IDS, SLOPE_IDS } = await import(new URL('../app/js/borders.js', import.meta.url));
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
function bestOnLine(f, L, hx, hy, n = 4000) {
  let best = -Infinity, bx = 0, by = 0;
  // The line as point + t·direction: the foot of the perpendicular from the
  // origin is (nx·c, ny·c), and (−ny, nx) runs along it.
  for (let i = 0; i <= n; i++) {
    const span = Math.max(hx, hy) * 2;
    const t = -span + (span * 2 * i) / n;
    const x = L.nx * L.c - L.ny * t;
    const y = L.ny * L.c + L.nx * t;
    if (Math.abs(x) > hx || Math.abs(y) > hy) continue;
    const v = f(x, y);
    if (isFinite(v) && v > best) { best = v; bx = x; by = y; }
  }
  return { x: bx, y: by, metres: best * 1000 };
}

function bestInside(f, L, hx, hy, depth, n = 260) {
  const side = (x, y) => L.nx * x + L.ny * y - L.c;
  let best = -Infinity, bx = 0, by = 0;
  for (let j = 0; j <= n; j++) {
    const y = -hy + (2 * hy * j) / n;
    for (let i = 0; i <= n; i++) {
      const x = -hx + (2 * hx * i) / n;
      if (side(x, y) > -depth) continue;          // not far enough inside
      const v = f(x, y);
      if (isFinite(v) && v > best) { best = v; bx = x; by = y; }
    }
  }
  return { x: bx, y: by, metres: best * 1000 };
}

check('the atlas mountains and the frontier slopes are all here',
  BORDER_IDS.length >= 12 && SLOPE_IDS.length >= 2,
  `${BORDER_IDS.length} examples, ${SLOPE_IDS.length} of them frontier slopes`);

let worstMargin = Infinity, worstGap = Infinity;
for (const id of BORDER_IDS) {
  const s = BORDERS[id];
  const f = compile(`${id}(x, y)`, ['x', 'y']);
  const L = boundaryOf(id);
  const side = (x, y) => L.nx * x + L.ny * y - L.c;
  const hx = s.halfX ?? s.half, hy = s.halfY ?? s.half;

  // The window is pushed back into the summit's own country so that there is
  // room to walk, so the summit is no longer at the origin — it is wherever
  // the data says.
  const own = side(s.summit.x, s.summit.y);
  const zTop = f(s.summit.x, s.summit.y) * 1000;
  const line = bestOnLine(f, L, hx, hy);
  // At least 150 m inside the other country: deep enough that a point there is
  // unambiguously interior rather than a rounding of the frontier itself.
  const deep = bestInside(f, L, hx, hy, 0.15);
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
  const probes = [[0, 0], [hx * 0.5, hy * 0.5], [-hx * 0.5, -hy * 0.5],
    [hx * 0.3, -hy * 0.7], [-hx * 0.6, hy * 0.2],
    [line.x - L.nx * off, line.y - L.ny * off],    // just inside the other country
    [line.x + L.nx * off, line.y + L.ny * off]];   // just inside the summit's own
  const agree = probes.every(([x, y]) => pred(x, y) === feasible(x, y));
  check(`  ${id}: the constraint in the box is the frontier`, agree, feasibleFor(id));

  // Off the window, honestly undefined — the survey has edges.
  check(`  ${id}: undefined beyond the window`,
    Number.isNaN(f(hx * 1.2, 0)) && Number.isNaN(f(0, -hy * 1.2)));

  // Something to show. The atlas mountains carry a photograph and its credit;
  // the frontier slopes are stretches of a line rather than catalogued
  // mountains, so there is no photograph of them to caption honestly and they
  // are held only to the description.
  const m = s.meta;
  const slope = s.kind === 'slope';
  check(`  ${id}: ${slope ? 'has a description in both languages' : 'has a photograph and a description'}`,
    m.blurb.length > 40 && m.blurbEs.length > 40
    && (slope ? !photoFor(id) : (!!photoFor(id) && !!m.credit)));
}

// How much of what you can see is yours to walk on.
//
// This is the number the frontier slopes exist to fix, so it is asserted rather
// than described: 70% of the window, by area, on the feasible side. The atlas
// mountains are reported beside them without a bar to clear, because for a
// summit that sits *on* the line no honest window can reach two thirds — see
// the guide for why.
{
  const share = (id) => {
    const sp = BORDERS[id];
    const hx = sp.halfX ?? sp.half, hy = sp.halfY ?? sp.half;
    const L = boundaryOf(id);
    let inside = 0, total = 0;
    for (let j = 0; j <= 200; j++) {
      const y = -hy + (2 * hy * j) / 200;
      for (let i = 0; i <= 200; i++) {
        const x = -hx + (2 * hx * i) / 200;
        total++;
        if (L.nx * x + L.ny * y - L.c <= 0) inside++;
      }
    }
    return inside / total;
  };
  const bad = SLOPE_IDS.filter((id) => Math.abs(share(id) - 0.70) > 0.02);
  check('every frontier slope is a 70/30 split of the window',
    SLOPE_IDS.length > 0 && bad.length === 0,
    SLOPE_IDS.map((id) => `${(100 * share(id)).toFixed(0)}%`).join(' '));

  const areas = BORDER_IDS.map((id) => {
    const sp = BORDERS[id];
    return 4 * (sp.halfX ?? sp.half) * (sp.halfY ?? sp.half);
  });
  const slopeAreas = SLOPE_IDS.map((id) => {
    const sp = BORDERS[id];
    return 4 * (sp.halfX ?? sp.half) * (sp.halfY ?? sp.half);
  });
  const widest = Math.max(...SLOPE_IDS.map((id) => 2 * Math.max(BORDERS[id].halfX, BORDERS[id].halfY)));
  check('and shows far more ground than the atlas windows do',
    Math.max(...slopeAreas) > 2 * Math.min(...areas.filter((a) => a > 0)) && widest > 20,
    `largest ${Math.max(...slopeAreas).toFixed(0)} km², widest ${widest.toFixed(0)} km across`);
}

check('on every mountain the frontier beats the interior',
  worstMargin > -5, `worst margin ${worstMargin.toFixed(0)} m`);
check('and every constrained maximum is strictly below its summit',
  worstGap > 1, `smallest gap ${worstGap.toFixed(0)} m`);

// Smoothness, measured against the surface's own resolution.
//
// A finite cosine sum has continuous second derivatives; an interpolated grid
// does not. But "the second derivative does not jump" is only meaningful if it
// is sampled finer than the finest wave in the sum — probe an M = 112 fit on a
// 28 km window at 56 m intervals and consecutive samples legitimately differ,
// because the shortest mode is only 250 m long. So the transect steps at an
// eighth of the finest wavelength, and the jump is judged as a fraction of how
// much f_xx varies along the whole transect. That is scale-free: it stays a
// test of continuity rather than a test of how sharp the fit was allowed to be.
let worstRel = 0, worstId = '';
for (const id of BORDER_IDS) {
  const s = BORDERS[id];
  const f = compile(`${id}(x, y)`, ['x', 'y']);
  const finest = (2 * Math.min(s.halfX ?? s.half, s.halfY ?? s.half)) / s.M;
  const dt = finest / 8;
  const h = dt;
  let prev = null, jump = 0, lo = Infinity, hi = -Infinity;
  const halfMin = Math.min(s.halfX ?? s.half, s.halfY ?? s.half);
  for (let t = -halfMin * 0.5; t <= halfMin * 0.5; t += dt) {
    const fxx = (f(t + h, 0) - 2 * f(t, 0) + f(t - h, 0)) / (h * h);
    if (!isFinite(fxx)) continue;
    lo = Math.min(lo, fxx); hi = Math.max(hi, fxx);
    if (prev !== null) jump = Math.max(jump, Math.abs(fxx - prev));
    prev = fxx;
  }
  const rel = jump / Math.max(1e-9, hi - lo);
  if (rel > worstRel) { worstRel = rel; worstId = id; }
}
check('second derivatives vary continuously on every mountain',
  worstRel < 0.12,
  `worst step is ${(worstRel * 100).toFixed(1)}% of the whole range (${worstId})`);

console.log(fails === 0
  ? '\nTHE FRONTIER CUTS THE MOUNTAIN, AND THE BEST YOU CAN REACH IS ON THE LINE'
  : `\n${fails} FAILURE(S)`);
process.exit(fails ? 1 : 0);
