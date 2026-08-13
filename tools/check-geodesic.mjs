/**
 * check-geodesic.mjs — walking forward follows a geodesic.
 *
 * "Straight ahead" on a curved surface is not a matter of taste: it is the
 * geodesic through the point with the walker's velocity as its initial
 * condition, and on surfaces whose geodesics are known in closed form the
 * answer can be checked against the mathematics rather than against a picture.
 *
 * A sphere's geodesics are its great circles, so a walk of length d subtends
 * exactly d/R at the centre and never leaves the plane through the centre
 * containing the initial velocity. A torus has three obvious families: the
 * outer equator, the inner equator, and every meridian. A flat patch has
 * straight lines. And a heading carried round a closed geodesic must come back
 * to itself, which is the parallel-transport half of the claim.
 *
 *   node tools/check-geodesic.mjs
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const THREE = await import(join(here, '../app/vendor/three.module.js'));
const { ParametricWalker, ImplicitWalker } = await import(join(here, '../app/js/walker.js'));
const { buildGeodesicGrid } = await import(join(here, '../app/js/gridlines.js'));

let fails = 0;
const check = (n, ok, d) => { if (!ok) fails++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`); };

const SCALE = 50;

/* ------------------------------------------- a sphere, in both descriptions */

function sphereWalkers() {
  const param = new ParametricWalker({
    X: (u, v) => Math.cos(u) * Math.sin(v),
    Y: (u, v) => Math.sin(u) * Math.sin(v),
    Z: (u, v) => Math.cos(v),
  }, {
    umin: 0, umax: 2 * Math.PI, vmin: 0.02, vmax: Math.PI - 0.02,
    scale: SCALE, sx: 1, sy: 1, sz: 1, wrapU: true, wrapV: false,
  });
  const imp = new ImplicitWalker((x, y, z) => x * x + y * y + z * z - 1, {
    scale: SCALE, sx: 1, sy: 1, sz: 1,
    bounds: { xmin: -2, xmax: 2, ymin: -2, ymax: 2, zmin: -2, zmax: 2 },
  });
  imp.placeAtWorld(new THREE.Vector3(0, 0, -SCALE));   // somewhere on it
  return { param, imp };
}

for (const [name, w] of Object.entries(sphereWalkers())) {
  // Start somewhere generic and head somewhere generic.
  if (w.u !== undefined) { w.placeAtUV(1.1, 1.3); } else { w.placeAtWorld(new THREE.Vector3(SCALE * 0.6, SCALE * 0.5, SCALE * 0.62)); }
  w.turn(0.7);

  const p0 = w.position(new THREE.Vector3());
  const R = p0.length();
  const fr0 = w.frame();
  const planeN = new THREE.Vector3().crossVectors(p0, fr0.fwd).normalize();

  // The great circle through p0 with velocity fwd, sampled as we go.
  const arc = R * 1.7;                       // most of the way round a hemisphere
  let offPlane = 0, offSphere = 0;
  w.flow(fr0.fwd.clone(), arc, (q) => {
    offPlane = Math.max(offPlane, Math.abs(q.dot(planeN)) / R);
    offSphere = Math.max(offSphere, Math.abs(q.length() - R) / R);
  });
  const p1 = w.position(new THREE.Vector3());
  const subtended = p0.angleTo(p1);

  check(`sphere (${name}): the path stays on the sphere`, offSphere < 2e-4,
    `worst radial error ${(offSphere * 100).toExponential(2)}%`);
  check(`sphere (${name}): the path stays in one great circle`, offPlane < 3e-3,
    `worst out-of-plane ${(offPlane * 100).toFixed(3)}% of R`);
  check(`sphere (${name}): arc length equals R times the angle`,
    Math.abs(subtended - arc / R) < 4e-3,
    `walked ${(arc / R).toFixed(4)} rad, subtended ${subtended.toFixed(4)} rad`);
}

/* --------------------------------------------- a heading round a closed loop */

{
  const { param: w } = sphereWalkers();
  w.placeAtUV(0.4, Math.PI / 2);           // on the equator
  w.turn(-0.9);                            // a heading at an angle to it
  const before = w.frame();
  // Walk the whole great circle. Coming back to the start, a parallel-
  // transported heading must be the heading it set out as.
  const R = w.position(new THREE.Vector3()).length();
  w.move(2 * Math.PI * R, 1, 0);
  const after = w.frame();
  const back = w.position(new THREE.Vector3());
  const p0 = new THREE.Vector3();
  w.placeAtUV(0.4, Math.PI / 2);
  w.position(p0);

  check('a closed geodesic comes back to where it started',
    back.distanceTo(p0) / R < 6e-3, `${(back.distanceTo(p0) / R * 100).toFixed(3)}% of R away`);
  check('and the heading comes back to itself',
    before.fwd.angleTo(after.fwd) < 0.02,
    `turned by ${(before.fwd.angleTo(after.fwd) * 180 / Math.PI).toFixed(2)}°`);
}

/* ------------------------------------------------- the torus's own geodesics */

{
  const torus = (a, b) => new ParametricWalker({
    X: (u, v) => (a + b * Math.cos(v)) * Math.cos(u),
    Y: (u, v) => (a + b * Math.cos(v)) * Math.sin(u),
    Z: (u, v) => b * Math.sin(v),
  }, {
    umin: 0, umax: 2 * Math.PI, vmin: 0, vmax: 2 * Math.PI,
    scale: SCALE, sx: 1, sy: 1, sz: 1, wrapU: true, wrapV: true,
  });

  // The outer equator, v = 0, is a geodesic: set off along it and stay on it.
  for (const [label, v0] of [['outer', 0], ['inner', Math.PI]]) {
    const w = torus(1, 0.4);
    w.placeAtUV(0.3, v0);
    // Head along increasing u.
    const fr = w.frame();
    const along = new THREE.Vector3(-Math.sin(0.3), 0, -Math.cos(0.3));
    w.dir.copy(along).addScaledVector(fr.n, -along.dot(fr.n)).normalize();
    let drift = 0;
    w.flow(w.frame().fwd.clone(), SCALE * 6, () => {
      const d = Math.abs(((w.v - v0 + Math.PI) % (2 * Math.PI)) - Math.PI);
      drift = Math.max(drift, d);
    });
    check(`torus: the ${label} equator is walked as a geodesic`, drift < 0.02,
      `drifted ${(drift * 180 / Math.PI).toFixed(2)}° off it over ${(6).toFixed(0)} radii`);
  }

  // Every meridian is a geodesic too.
  const w = torus(1, 0.4);
  w.placeAtUV(1.0, 0.7);
  const fr = w.frame();
  // The meridian direction is d/dv, which the walker can be aimed along.
  const rv = new THREE.Vector3();
  const eps = 1e-4;
  const at = (u, v) => new THREE.Vector3(
    (1 + 0.4 * Math.cos(v)) * Math.cos(u) * SCALE,
    0.4 * Math.sin(v) * SCALE,
    -(1 + 0.4 * Math.cos(v)) * Math.sin(u) * SCALE,
  );
  rv.copy(at(1.0, 0.7 + eps)).sub(at(1.0, 0.7 - eps)).normalize();
  w.dir.copy(rv).addScaledVector(fr.n, -rv.dot(fr.n)).normalize();
  let uDrift = 0;
  w.flow(w.frame().fwd.clone(), SCALE * 4, () => {
    uDrift = Math.max(uDrift, Math.abs(((w.u - 1.0 + Math.PI) % (2 * Math.PI)) - Math.PI));
  });
  check('torus: a meridian is walked as a geodesic', uDrift < 0.02,
    `drifted ${(uDrift * 180 / Math.PI).toFixed(2)}° in u`);
}

/* ----------------------------------------------------- a flat patch is flat */

{
  const w = new ParametricWalker({
    X: (u, v) => u, Y: (u, v) => v, Z: () => 0,
  }, {
    umin: -4, umax: 4, vmin: -4, vmax: 4,
    scale: SCALE, sx: 1, sy: 1, sz: 1, wrapU: false, wrapV: false,
  });
  w.placeAtUV(-3, -3);
  w.turn(0.6);
  const p0 = w.position(new THREE.Vector3());
  const d0 = w.frame().fwd.clone();
  let bend = 0;
  const L = SCALE * 4;
  w.flow(d0.clone(), L, (q) => {
    // Distance from the straight line through p0 along d0.
    const rel = q.clone().sub(p0);
    bend = Math.max(bend, rel.clone().addScaledVector(d0, -rel.dot(d0)).length());
  });
  check('a flat patch is walked in a straight line', bend / L < 1e-9,
    `worst deviation ${(bend / L).toExponential(2)} of the walk`);
}

/* ------------------------------------- the geodesic grid is a square lattice */

{
  // On a flat patch every geodesic is a straight line and the grid must come
  // out as an exact square lattice of the side it was asked for. That is the
  // whole construction — axes, marks, transported perpendiculars, both families
  // — checked end to end against an answer known by hand.
  const L = 30;
  const w = new ParametricWalker({
    X: (u, v) => u, Y: (u, v) => v, Z: () => 0,
  }, {
    umin: -10, umax: 10, vmin: -10, vmax: 10,
    scale: SCALE, sx: 1, sy: 1, sz: 1, wrapU: false, wrapV: false,
  });
  w.placeAtUV(0, 0);
  w.turn(0.41);                       // a grid at an angle, so nothing is free
  const g = buildGeodesicGrid(w, { unit: L, cells: 4, radius: SCALE * 4 });

  check('the geodesic grid builds on a flat patch', !!g, g ? `${g.userData.segments} segments` : 'null');

  if (g) {
    // Every drawn point must sit on the lattice: its coordinates in the seed's
    // own frame must be a multiple of L along one axis.
    const fr = w.frame();
    const e1 = fr.fwd, e2 = fr.side;
    const p0 = w.position(new THREE.Vector3());
    const arr = g.children[0].geometry.getAttribute('position').array;
    let worst = 0;
    const q = new THREE.Vector3();
    for (let i = 0; i < arr.length; i += 3) {
      q.set(arr[i], arr[i + 1], arr[i + 2]).sub(p0);
      const a = q.dot(e1), b = q.dot(e2);
      // On the lattice means at least one coordinate is a multiple of L.
      const ra = Math.abs(a / L - Math.round(a / L)) * L;
      const rb = Math.abs(b / L - Math.round(b / L)) * L;
      worst = Math.max(worst, Math.min(ra, rb));
    }
    check('and every line of it lies on the lattice it promised',
      worst < L * 1e-6, `worst point is ${worst.toExponential(2)} off a grid line`);
  }
}

{
  // On a sphere the marks along an axis must be exactly L of arc apart, which
  // is R times the angle they subtend.
  const { param: w } = sphereWalkers();
  w.placeAtUV(0.9, 1.2);
  const R = w.position(new THREE.Vector3()).length();
  const L = R * 0.4;
  const p0 = w.position(new THREE.Vector3());
  let worst = 0;
  let prev = p0.clone();
  for (let k = 1; k <= 3; k++) {
    const end = w.flow(w.dir.clone(), L);
    if (!end) break;
    w.dir.copy(end.v);
    const q = w.position(new THREE.Vector3());
    worst = Math.max(worst, Math.abs(prev.angleTo(q) * R - L) / L);
    prev = q;
  }
  check('grid marks are the stated arc length apart', worst < 2e-4,
    `worst ${(worst * 100).toExponential(2)}% off ${L.toFixed(2)}`);
}

console.log(fails === 0 ? '\nWALKING IS GEODESIC' : `\n${fails} FAILURE(S)`);
process.exit(fails ? 1 : 0);
