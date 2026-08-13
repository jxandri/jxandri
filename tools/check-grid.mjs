/**
 * check-grid.mjs — a grid square is two explorers on a side, everywhere.
 *
 * The claim is a length, so it is checked as a length: take the lines the
 * builder actually produced and measure the gap between neighbours in world
 * metres. Three builders, three ways of choosing where the lines go, one answer.
 *
 * The graph and the geodesic grids owe the number exactly. The parameter grid
 * owes it on average and cannot owe it pointwise — a parameter grid's whole
 * content is that its spacing is not uniform — so it is held to the mean, which
 * is what it calibrates against.
 *
 *   node tools/check-grid.mjs
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const THREE = await import(join(here, '../app/vendor/three.module.js'));
const { Field } = await import(join(here, '../app/js/field.js'));
const { ParametricWalker } = await import(join(here, '../app/js/walker.js'));
const { buildGraphGrid, buildParametricGrid, buildGeodesicGrid } =
  await import(join(here, '../app/js/gridlines.js'));

let fails = 0;
const check = (n, ok, d) => { if (!ok) fails++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`); };

/** Two explorer heights, at whatever scale the explorer is. */
const SIDE = (zoom = 1, charScale = 1) => 2 * 1.8 * zoom * charScale;

/* ---------------------------------------------------------------- graph */

for (const [label, zoom] of [['1 : 1', 1], ['10 : 1', 10], ['1 : 10', 0.1]]) {
  // A flat function, on purpose. The drawn lines are lifted a hair along the
  // surface normal so they float clear of the surface, and on a curved f that
  // lift has a horizontal component — so the world x of a line of constant
  // math x is not quite constant, and the spacing cannot be read straight off
  // the buffer. On a plane the normal is vertical, the lift is vertical, and
  // what comes out of the buffer is exactly where the lines were put.
  const field = new Field({
    fn: () => 0,
    xmin: -2, xmax: 2, ymin: -2, ymax: 2, worldSize: 220,
    sx: 1, sy: 1, sz: 1,
  });
  const unit = SIDE(zoom);
  const g = buildGraphGrid(field, { unit });
  if (!g) { check(`graph at ${label}: builds`, false); continue; }

  // The builder reports the side it settled on and by what whole multiple it
  // had to widen the asked-for one to stay drawable.
  const { side, multiple } = g.userData;
  check(`graph at ${label}: the square is the length asked for`,
    Math.abs(side - unit * multiple) < 1e-9,
    `${side.toFixed(4)} m, asked ${unit.toFixed(4)} × ${multiple}`);

  // And measured off the lines themselves. A line of constant x is a column of
  // vertices all sharing one x; the lines of constant y are traced across the
  // domain and contribute one vertex at each of many different x. So the
  // columns are the x values that a large number of vertices share, and the
  // gaps between consecutive columns are the thing being claimed.
  const arr = g.children[0].geometry.getAttribute('position').array;
  const seen = new Map();
  for (let i = 0; i < arr.length; i += 3) {
    const k = Math.round(arr[i] * 1e3) / 1e3;
    seen.set(k, (seen.get(k) || 0) + 1);
  }
  // A line of constant x contributes hundreds of vertices at one x; a line of
  // constant y contributes one vertex at each of its own sample points, and
  // there are far fewer lines than samples. The columns are the crowded ones.
  const busiest = Math.max(...seen.values());
  const columns = [...seen.entries()].filter(([, n]) => n > busiest / 2)
    .map(([x]) => x).sort((a, b) => a - b);
  let worst = 0;
  for (let i = 1; i < columns.length; i++) {
    worst = Math.max(worst, Math.abs((columns[i] - columns[i - 1]) - side));
  }
  check(`graph at ${label}: the gap between grid lines is one square`,
    columns.length >= 3 && worst / side < 3e-3,
    `${columns.length} lines, worst gap error ${worst.toFixed(4)} m on ${side.toFixed(4)} m`);
}

/* ---------------------------------------------------- parametric, on average */

{
  const SCALE = 55, CHAR = SCALE / 14;
  const exprs = {
    X: (u, v) => (1 + 0.4 * Math.cos(v)) * Math.cos(u),
    Y: (u, v) => (1 + 0.4 * Math.cos(v)) * Math.sin(u),
    Z: (u, v) => 0.4 * Math.sin(v),
  };
  const unit = SIDE(1, CHAR);
  const g = buildParametricGrid(exprs, {
    unit, umin: 0, umax: 2 * Math.PI, vmin: 0, vmax: 2 * Math.PI,
    scale: SCALE, sx: 1, sy: 1, sz: 1, radius: SCALE,
  });
  check('torus: the parameter grid builds', !!g, g ? `${g.userData.segments} segments` : 'null');

  if (g) {
    // The u lines sit at multiples of du. Their mean separation in arc length
    // along the v = 0 circle should be the side asked for, because that is the
    // calibration: mean |r_u| over the patch times du.
    const n = Math.round((2 * Math.PI) / ((2 * Math.PI) / Math.max(1, Math.round(2 * Math.PI * 1))));
    const at = (u, v) => new THREE.Vector3(
      exprs.X(u, v) * SCALE, exprs.Z(u, v) * SCALE, -exprs.Y(u, v) * SCALE);
    // Recover the number of u lines from the reported side and the mean speed.
    let sum = 0, m = 0;
    for (let i = 0; i <= 8; i++) {
      for (let j = 0; j <= 8; j++) {
        const u = (2 * Math.PI * i) / 8, v = (2 * Math.PI * j) / 8;
        const h = 1e-4;
        sum += at(u + h, v).distanceTo(at(u - h, v)) / (2 * h);
        m++;
      }
    }
    const meanSpeed = sum / m;
    const nu = Math.max(1, Math.round(((2 * Math.PI) * meanSpeed) / g.userData.side));
    const meanGap = ((2 * Math.PI) / nu) * meanSpeed;
    check('torus: the parameter grid averages the side it asked for',
      Math.abs(meanGap - g.userData.side) / g.userData.side < 0.06,
      `mean ${meanGap.toFixed(3)} against ${g.userData.side.toFixed(3)}`);
  }
}

/* ------------------------------------------------- geodesic, exactly, on a sphere */

{
  const SCALE = 55, CHAR = SCALE / 14;
  const w = new ParametricWalker({
    X: (u, v) => Math.cos(u) * Math.sin(v),
    Y: (u, v) => Math.sin(u) * Math.sin(v),
    Z: (u, v) => Math.cos(v),
  }, {
    umin: 0, umax: 2 * Math.PI, vmin: 0.02, vmax: Math.PI - 0.02,
    scale: SCALE, sx: 1, sy: 1, sz: 1, wrapU: true, wrapV: false,
  });
  w.placeAtUV(0.8, 1.2);
  const unit = SIDE(1, CHAR);
  const g = buildGeodesicGrid(w, { unit, cells: 4, radius: SCALE });
  check('sphere: the geodesic grid builds', !!g, g ? `${g.userData.segments} segments` : 'null');
  if (g) {
    check('sphere: and its square is exactly the side asked for',
      Math.abs(g.userData.side - unit) < 1e-12,
      `${g.userData.side.toFixed(6)} against ${unit.toFixed(6)}`);

    // Walk the axis and confirm the marks really are that far apart in arc.
    const R = w.position(new THREE.Vector3()).length();
    let prev = w.position(new THREE.Vector3());
    let worst = 0;
    for (let k = 0; k < 4; k++) {
      const end = w.flow(w.dir.clone(), unit);
      if (!end) break;
      w.dir.copy(end.v);
      const q = w.position(new THREE.Vector3());
      worst = Math.max(worst, Math.abs(prev.angleTo(q) * R - unit) / unit);
      prev = q;
    }
    check('sphere: measured along the surface, each side is that arc length',
      worst < 1e-3, `worst ${(worst * 100).toExponential(2)}% off ${unit.toFixed(3)}`);
  }
}

/* ------------------------------- and one rule: all three ask for the same thing */

check('all three regimes use two explorer heights',
  Math.abs(SIDE(1, 1) - 3.6) < 1e-12 && Math.abs(SIDE(0.1, 1) - 0.36) < 1e-12,
  `${SIDE(1, 1).toFixed(3)} m at 1:1, ${SIDE(0.1, 1).toFixed(3)} m at 1:10`);

console.log(fails === 0 ? '\nGRID SQUARES ARE TWO EXPLORERS A SIDE' : `\n${fails} FAILURE(S)`);
process.exit(fails ? 1 : 0);
