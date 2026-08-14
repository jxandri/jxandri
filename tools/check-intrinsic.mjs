/**
 * check-intrinsic.mjs — the neighbourhood, the arrows and the plane are the
 * objects they claim to be.
 *
 * Every claim here is a number, so every check is a number. The sphere is the
 * whole test set on purpose: it is the one surface whose geodesic circles,
 * circumferences and parallel transport are known in closed form, so agreement
 * is agreement with the answer and not with a second implementation.
 *
 *   node tools/check-intrinsic.mjs
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const THREE = await import(join(here, '../app/vendor/three.module.js'));
const { ParametricWalker, graphWalker } = await import(join(here, '../app/js/walker.js'));
const { Field } = await import(join(here, '../app/js/field.js'));
const { GeodesicDisc, TangentPatch, gridDirections } =
  await import(join(here, '../app/js/intrinsic.js'));

let fails = 0;
const check = (n, ok, d) => { if (!ok) fails++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`); };

const R = 60;                      // the sphere's world radius
const sphere = () => {
  const w = new ParametricWalker({
    X: (u, v) => Math.cos(u) * Math.sin(v),
    Y: (u, v) => Math.sin(u) * Math.sin(v),
    Z: (u, v) => Math.cos(v),
  }, {
    umin: 0, umax: 2 * Math.PI, vmin: 0.02, vmax: Math.PI - 0.02,
    scale: R, sx: 1, sy: 1, sz: 1, wrapU: true, wrapV: false,
  });
  w.placeAtUV(0.7, Math.PI / 2);   // on the equator, clear of both poles
  return w;
};

/* ------------------------------------------- the rim is a geodesic circle */

{
  const w = sphere();
  const r = R * 0.35;                       // a good fraction of the sphere
  const disc = new GeodesicDisc(36, 4);
  const out = disc.update(w, r, 0);         // no lift: the buffer is the surface
  check('sphere: the geodesic circle builds', !!out);

  if (out) {
    // Every rim point should be exactly r of arc from the centre — and on a
    // sphere arc is R times the angle at the origin, which needs no integrator.
    const c = w.position(new THREE.Vector3());
    const arr = disc.rimGeom.getAttribute('position').array;
    let worst = 0;
    for (let s = 0; s < 36; s++) {
      const p = new THREE.Vector3(arr[s * 3], arr[s * 3 + 1], arr[s * 3 + 2]);
      worst = Math.max(worst, Math.abs(c.angleTo(p) * R - r) / r);
    }
    check('sphere: every rim point is exactly the radius away, along the surface',
      worst < 3e-3, `worst ${(worst * 100).toFixed(3)}%`);

    // Bertrand–Puiseux, the whole reason the circle is worth drawing:
    // C = 2πR·sin(r/R), so the ratio to a flat circle is sin(r/R)/(r/R) < 1.
    const want = Math.sin(r / R) / (r / R);
    check('sphere: its circumference falls short of 2πr by the curvature',
      Math.abs(out.ratio - want) / want < 5e-3,
      `ratio ${out.ratio.toFixed(5)}, sin(r/R)/(r/R) = ${want.toFixed(5)}`);
    check('sphere: and that shortfall is a real one, not rounding',
      out.ratio < 0.99, `${out.ratio.toFixed(4)}`);
  }
  disc.dispose();
}

/* ------------------------------------------------ a plane owes exactly 2πr */

{
  const flat = new ParametricWalker({
    X: (u) => u, Y: (u, v) => v, Z: () => 0,
  }, {
    umin: -20, umax: 20, vmin: -20, vmax: 20,
    scale: 5, sx: 1, sy: 1, sz: 1, wrapU: false, wrapV: false,
  });
  flat.placeAtUV(0, 0);
  const disc = new GeodesicDisc(48, 3);
  const out = disc.update(flat, 12, 0);
  // A 48-gon inscribed in a circle is short by (sin(π/48)/(π/48)) ≈ 0.99857,
  // which is the polygon's error and not the surface's.
  const polygon = Math.sin(Math.PI / 48) / (Math.PI / 48);
  check('plane: the circle of radius r has circumference 2πr',
    out && Math.abs(out.ratio - polygon) < 2e-3,
    out ? `ratio ${out.ratio.toFixed(5)} against the 48-gon's ${polygon.toFixed(5)}` : 'no disc');
  disc.dispose();
}

/* ------------------------------------------------- coordinate directions */

{
  const w = sphere();
  const par = gridDirections(w, 'param');
  const n = w.normal(new THREE.Vector3());
  check('sphere: the parameter directions are tangent to it',
    Math.abs(par.a.dot(n)) < 1e-9 && Math.abs(par.b.dot(n)) < 1e-9,
    `${par.a.dot(n).toExponential(1)}, ${par.b.dot(n).toExponential(1)}`);
  // Longitude and latitude meet at right angles on a sphere — that is what
  // makes the usual parametrisation orthogonal, and it is worth confirming
  // that the arrows say so.
  check('sphere: longitude and latitude cross at a right angle',
    Math.abs(par.a.angleTo(par.b) - Math.PI / 2) < 1e-6,
    `${(par.a.angleTo(par.b) * 180 / Math.PI).toFixed(4)}°`);

  const geo = gridDirections(w, 'geodesic');
  check('sphere: the geodesic axes are orthonormal and tangent',
    Math.abs(geo.a.length() - 1) < 1e-9 && Math.abs(geo.b.length() - 1) < 1e-9
    && Math.abs(geo.a.dot(geo.b)) < 1e-9 && Math.abs(geo.a.dot(n)) < 1e-9);

  // Where the surface is tangent to a coordinate plane, that coordinate is
  // stationary and has no direction of increase. The sphere at (1,0,0) is the
  // textbook case, and the honest answer there is "none".
  const edge = sphere();
  edge.placeAtUV(0, Math.PI / 2);          // world +X, normal along world +X
  const co = gridDirections(edge, 'coord');
  check('sphere: where x is stationary, there is no x direction to draw',
    co.a === null && co.b !== null,
    `x ${co.a === null ? 'none' : 'drawn'}, y ${co.b === null ? 'none' : 'drawn'}`);
}

/* ------------------------------------------------------- the tangent plane */

{
  const w = sphere();
  const patch = new TangentPatch();
  const lift = 0.7;
  check('sphere: the tangent patch builds', patch.update(w, 14, lift));
  const p = w.position(new THREE.Vector3());
  const n = w.normal(new THREE.Vector3());
  const arr = patch.geometry.getAttribute('position').array;
  let worst = 0, worstSide = 0;
  const c = [];
  for (let i = 0; i < 4; i++) {
    const q = new THREE.Vector3(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]);
    c.push(q);
    worst = Math.max(worst, Math.abs(q.clone().sub(p).dot(n) - lift));
  }
  for (let i = 0; i < 4; i++) {
    worstSide = Math.max(worstSide,
      Math.abs(c[i].distanceTo(c[(i + 1) % 4]) - 28));
  }
  // Read back out of a Float32Array, so the floor is float32's own ~1e-7
  // relative precision on coordinates of order R, not the arithmetic's.
  const eps = R * 1e-6;
  check('sphere: all four corners lie in the tangent plane',
    worst < eps, `worst ${worst.toExponential(2)} m off, float32 floor ${eps.toExponential(1)}`);
  check('sphere: and it is a square of the size asked for',
    worstSide < eps, `worst side error ${worstSide.toExponential(2)} m on 28 m sides`);
  patch.dispose();
}

/* ------------------------------------- the reference frame is transported */

{
  const w = sphere();
  const before = w.gridFrame().e1.clone();

  // Looking around must not move it. That is the entire reason it exists: a
  // grid whose axes follow the mouse is not a coordinate system.
  w.turn(1.1);
  check('the grid axes do not follow the mouse',
    w.gridFrame().e1.distanceTo(before) < 1e-12);

  // Walking out along a geodesic and back must bring it home, because parallel
  // transport along a path and back along the same path is the identity.
  w.move(R * 0.4, 1, 0);
  w.move(R * 0.4, -1, 0);
  const after = w.gridFrame().e1;
  check('out along a geodesic and back leaves it where it started',
    after.distanceTo(before) < 2e-3, `moved ${after.distanceTo(before).toExponential(2)}`);
}

/* -------------------------------------------------- a graph is a surface too */

{
  const field = new Field({
    fn: (x, y) => 0.4 * x * x - 0.3 * y * y,     // a saddle: K < 0
    xmin: -2, xmax: 2, ymin: -2, ymax: 2, worldSize: 200, sx: 1, sy: 1, sz: 1,
  });
  const w = graphWalker(field);
  w.placeAtUV(0, 0);
  const p = w.position(new THREE.Vector3());
  check('graph: the walker stands where the field puts the surface',
    Math.abs(p.x - field.worldX(0)) < 1e-9
    && Math.abs(p.y - field.worldY(field.height(0, 0))) < 1e-9
    && Math.abs(p.z - field.worldZ(0)) < 1e-9,
    `(${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)})`);

  const disc = new GeodesicDisc(36, 3);
  const out = disc.update(w, 18, 0);
  check('saddle: the geodesic circle builds on a graph', !!out);
  // Negative curvature: more circumference than a flat circle, not less.
  check('saddle: its circumference overshoots 2πr, as negative curvature must',
    out && out.ratio > 1.0, out ? `ratio ${out.ratio.toFixed(5)}` : 'no disc');
  disc.dispose();
}

console.log(fails === 0 ? '\nTHE INTRINSIC OBJECTS ARE WHAT THEY CLAIM' : `\n${fails} FAILURE(S)`);
process.exit(fails ? 1 : 0);
