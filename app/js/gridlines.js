/**
 * gridlines.js — the coordinate grid, drawn on the surface rather than under it.
 *
 * A textbook picture of a surface almost always has a mesh on it, and the mesh
 * is not decoration: it is the coordinate system, and reading it is how you see
 * what the parametrisation is doing. A sphere in polar coordinates has parameter
 * lines that crowd at the poles; a helicoid's do not meet at right angles; a
 * Möbius strip's long parameter closes up while its short one does not. None of
 * that is visible on a bare shaded surface.
 *
 * Three kinds of surface, three honest answers to "what is the coordinate grid
 * here", and each is the intersection of the surface with a family of level
 * sets of the coordinates:
 *
 *   parametric  r(u,v)      — the parameter lines themselves, u = const and
 *       v = const, evaluated on the surface. This is the grid the surface was
 *       built from, so it is exact.
 *
 *   graph       z = f(x,y)  — the Cartesian grid of the domain, lifted: the
 *       curves x = const and y = const with z = f. This is literally the grid
 *       drawn on the floor of the plot, pushed up onto the surface.
 *
 *   implicit    F(x,y,z)=0  — the surface's intersections with the coordinate
 *       planes x = const, y = const, z = const, found by marching squares on F
 *       restricted to each plane. Every vertex lies on the surface to within the
 *       linear interpolation, which is the same accuracy the surface itself was
 *       meshed at.
 *
 * Both sides. The grid is drawn twice, offset a hair along the surface normal
 * and a hair against it. From outside, the outer copy floats clear of the
 * surface and the inner one is hidden behind it; from inside, exactly the other
 * way round. That is what makes the grid readable when the explorer is walking
 * on the inside of a torus, where a single copy would be buried in the surface
 * it is supposed to be marking — and it costs one extra draw of some thin
 * lines, which is nothing next to getting it wrong in half the views.
 */

import * as THREE from '../vendor/three.module.js';

/** Dark ink: legible against greens, browns and snow alike. */
const INK = 0x121a24;

/**
 * How far the two copies sit off the surface, as a fraction of its size.
 *
 * Large enough to clear depth-buffer noise on a surface meshed at a few hundred
 * cells, small enough that at any sane camera distance the line still reads as
 * lying *on* the surface rather than hovering over it.
 */
const LIFT = 0.0016;

/**
 * Assemble the two offset copies.
 *
 * @param polys array of polylines; each is { p: [x,y,z,...], n: [x,y,z,...] }
 *              in world space, positions and unit surface normals paired.
 */
function twoSided(polys, lift) {
  let segs = 0;
  for (const poly of polys) segs += Math.max(0, poly.p.length / 3 - 1);
  if (segs === 0) return null;

  const out = new Float32Array(segs * 6);
  const inn = new Float32Array(segs * 6);
  let k = 0;

  for (const poly of polys) {
    const { p, n } = poly;
    const count = p.length / 3;
    for (let i = 0; i + 1 < count; i++) {
      for (const [a, b] of [[i, i + 1]]) {
        for (const idx of [a, b]) {
          const o = idx * 3;
          out[k] = p[o] + n[o] * lift;
          out[k + 1] = p[o + 1] + n[o + 1] * lift;
          out[k + 2] = p[o + 2] + n[o + 2] * lift;
          inn[k] = p[o] - n[o] * lift;
          inn[k + 1] = p[o + 1] - n[o + 1] * lift;
          inn[k + 2] = p[o + 2] - n[o + 2] * lift;
          k += 3;
        }
      }
    }
  }

  const group = new THREE.Group();
  group.name = 'surface-grid';
  const mat = new THREE.LineBasicMaterial({
    color: INK, transparent: true, opacity: 0.72, depthWrite: false, fog: true,
  });
  for (const arr of [out, inn]) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const l = new THREE.LineSegments(g, mat);
    l.renderOrder = 3;
    l.frustumCulled = false;
    group.add(l);
  }
  group.userData.material = mat;
  group.userData.segments = segs;
  return group;
}

/** Dispose everything a grid group owns. */
export function disposeGrid(group) {
  if (!group) return;
  group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  if (group.userData.material) group.userData.material.dispose();
}

/**
 * A round step near `span / target`, so the lines land on numbers a student
 * would have chosen — 0.5 and 1 and 2, never 0.3714.
 */
export function niceStep(span, target) {
  const raw = span / Math.max(1, target);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const r = raw / mag;
  return (r < 1.5 ? 1 : r < 3.5 ? 2 : r < 7.5 ? 5 : 10) * mag;
}

/* --------------------------------------------------------------- graph */

/**
 * The Cartesian grid of the domain, lifted onto z = f(x, y).
 *
 * Each line is traced at the mesh's own resolution rather than between its
 * endpoints, because the whole point is that it follows the surface: a straight
 * segment from one side of a hill to the other would pass through it.
 */
export function buildGraphGrid(field, opts = {}) {
  const target = opts.divisions || 10;
  const samples = opts.samples || 220;
  const stepX = niceStep(field.xmax - field.xmin, target);
  const stepY = niceStep(field.ymax - field.ymin, target);
  const polys = [];
  const n = new THREE.Vector3();

  // Walk a line, breaking it wherever f stops being defined so the grid does
  // not draw a chord across a hole in the domain.
  const trace = (fixed, along) => {
    let p = [], nr = [];
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const [x, y] = along(fixed, t);
      const z = field.height(x, y);
      if (!isFinite(z)) {
        if (p.length >= 6) polys.push({ p, n: nr });
        p = []; nr = [];
        continue;
      }
      p.push(field.worldX(x), field.worldY(z), field.worldZ(y));
      field.worldNormal(x, y, n);
      nr.push(n.x, n.y, n.z);
    }
    if (p.length >= 6) polys.push({ p, n: nr });
  };

  const first = (lo, step) => Math.ceil(lo / step) * step;
  for (let x = first(field.xmin, stepX); x <= field.xmax + 1e-9; x += stepX) {
    trace(x, (xx, t) => [xx, field.ymin + t * (field.ymax - field.ymin)]);
  }
  for (let y = first(field.ymin, stepY); y <= field.ymax + 1e-9; y += stepY) {
    trace(y, (yy, t) => [field.xmin + t * (field.xmax - field.xmin), yy]);
  }

  return twoSided(polys, field.worldSize * LIFT);
}

/* ---------------------------------------------------------- parametric */

/**
 * The parameter lines of r(u, v).
 *
 * Normals come from the same cross product the mesh was built with, so the grid
 * sits off the surface by the same amount everywhere — including at a pole,
 * where r_u × r_v vanishes and the position vector stands in for it.
 */
export function buildParametricGrid(exprs, opts) {
  const { X, Y, Z } = exprs;
  const { umin, umax, vmin, vmax } = opts;
  const scale = opts.scale || 1;
  const sx = opts.sx ?? 1, sy = opts.sy ?? 1, sz = opts.sz ?? 1;
  const target = opts.divisions || 14;
  const samples = opts.samples || 180;
  const h = Math.min(umax - umin, vmax - vmin) * 1e-4;

  const at = (u, v, out) => {
    out.set(X(u, v) * scale * sx, Z(u, v) * scale * sz, -Y(u, v) * scale * sy);
    return isFinite(out.x) && isFinite(out.y) && isFinite(out.z);
  };

  const P = new THREE.Vector3(), A = new THREE.Vector3(), B = new THREE.Vector3();
  const nrm = (u, v, out) => {
    if (!at(u + h, v, A) || !at(u, v + h, B)) { out.set(0, 1, 0); return; }
    A.sub(P); B.sub(P);
    out.crossVectors(A, B);
    if (out.lengthSq() < 1e-24) out.copy(P);          // a pole
    if (out.lengthSq() < 1e-24) out.set(0, 1, 0);     // and the origin is one
    out.normalize();
  };

  const polys = [];
  const N = new THREE.Vector3();
  const trace = (fixed, isU) => {
    let p = [], nr = [];
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const u = isU ? fixed : umin + t * (umax - umin);
      const v = isU ? vmin + t * (vmax - vmin) : fixed;
      if (!at(u, v, P)) {
        if (p.length >= 6) polys.push({ p, n: nr });
        p = []; nr = [];
        continue;
      }
      const px = P.x, py = P.y, pz = P.z;
      nrm(u, v, N);
      p.push(px, py, pz);
      nr.push(N.x, N.y, N.z);
    }
    if (p.length >= 6) polys.push({ p, n: nr });
  };

  // Evenly spaced in the parameter, not in arc length — because the crowding
  // that produces is the fact about the parametrisation worth seeing.
  const du = (umax - umin) / target, dv = (vmax - vmin) / target;
  for (let i = 0; i <= target; i++) trace(umin + i * du, true);
  for (let j = 0; j <= target; j++) trace(vmin + j * dv, false);

  const radius = opts.radius || 1;
  return twoSided(polys, radius * LIFT * 2.2);
}

/* ------------------------------------------------------------ implicit */

/**
 * Where the surface F = 0 meets the coordinate planes.
 *
 * On each plane the surface becomes an ordinary level curve of a function of
 * two variables, so this is marching squares — the same algorithm the level
 * curves on the terrain use, run on a slice instead of on the ground. Segments
 * come out unordered, which does not matter: the grid is drawn as line
 * segments, and a segment needs no neighbours.
 *
 * Normals are ∇F, normalised, evaluated at each endpoint and mapped into world
 * axes — the same normal the walker stands on.
 */
export function buildImplicitGrid(F, opts) {
  const { xmin, xmax, ymin, ymax, zmin, zmax } = opts;
  const scale = opts.scale || 1;
  const sx = opts.sx ?? 1, sy = opts.sy ?? 1, sz = opts.sz ?? 1;
  const target = opts.divisions || 8;
  const res = opts.res || 96;
  const h = Math.max(xmax - xmin, ymax - ymin, zmax - zmin) * 1e-4;

  const toWorld = (x, y, z, out) => out.set(x * scale * sx, z * scale * sz, -y * scale * sy);
  const N = new THREE.Vector3();
  const W = new THREE.Vector3();

  const normalAt = (x, y, z, out) => {
    const gx = (F(x + h, y, z) - F(x - h, y, z)) / (2 * h);
    const gy = (F(x, y + h, z) - F(x, y - h, z)) / (2 * h);
    const gz = (F(x, y, z + h) - F(x, y, z - h)) / (2 * h);
    out.set(gx / (sx || 1), gz / (sz || 1), -gy / (sy || 1));
    if (out.lengthSq() < 1e-20) out.set(0, 1, 0);
    return out.normalize();
  };

  const polys = [];

  /**
   * One slice. `place(a, b)` maps the two in-plane coordinates back to (x,y,z),
   * so the same marching-squares body serves all three families of planes.
   */
  const slice = (aMin, aMax, bMin, bMax, place) => {
    const w = res + 1;
    const val = new Float64Array(w * w);
    for (let j = 0; j < w; j++) {
      const b = bMin + (j / res) * (bMax - bMin);
      for (let i = 0; i < w; i++) {
        const a = aMin + (i / res) * (aMax - aMin);
        const q = place(a, b);
        const f = F(q[0], q[1], q[2]);
        val[j * w + i] = isFinite(f) ? f : NaN;
      }
    }

    const A = (i) => aMin + (i / res) * (aMax - aMin);
    const B = (j) => bMin + (j / res) * (bMax - bMin);

    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        const k0 = j * w + i, k1 = j * w + i + 1, k2 = (j + 1) * w + i + 1, k3 = (j + 1) * w + i;
        const z0 = val[k0], z1 = val[k1], z2 = val[k2], z3 = val[k3];
        if (!(isFinite(z0) && isFinite(z1) && isFinite(z2) && isFinite(z3))) continue;
        const s0 = z0 >= 0, s1 = z1 >= 0, s2 = z2 >= 0, s3 = z3 >= 0;
        if (s0 === s1 && s1 === s2 && s2 === s3) continue;

        const a0 = A(i), a1 = A(i + 1), b0 = B(j), b1 = B(j + 1);
        const cut = (za, zb, aa, ba, ab, bb) => {
          const t = za / (za - zb);
          return [aa + (ab - aa) * t, ba + (bb - ba) * t];
        };
        const hits = [];
        if (s0 !== s1) hits.push(cut(z0, z1, a0, b0, a1, b0));
        if (s1 !== s2) hits.push(cut(z1, z2, a1, b0, a1, b1));
        if (s2 !== s3) hits.push(cut(z2, z3, a1, b1, a0, b1));
        if (s3 !== s0) hits.push(cut(z3, z0, a0, b1, a0, b0));

        for (let q = 0; q + 1 < hits.length; q += 2) {
          const p = [], n = [];
          for (const [a, b] of [hits[q], hits[q + 1]]) {
            const [x, y, z] = place(a, b);
            toWorld(x, y, z, W);
            normalAt(x, y, z, N);
            p.push(W.x, W.y, W.z);
            n.push(N.x, N.y, N.z);
          }
          polys.push({ p, n });
        }
      }
    }
  };

  const stepX = niceStep(xmax - xmin, target);
  const stepY = niceStep(ymax - ymin, target);
  const stepZ = niceStep(zmax - zmin, target);
  const first = (lo, step) => Math.ceil(lo / step) * step;

  for (let x = first(xmin, stepX); x <= xmax + 1e-9; x += stepX) {
    const xx = x;
    slice(ymin, ymax, zmin, zmax, (a, b) => [xx, a, b]);
  }
  for (let y = first(ymin, stepY); y <= ymax + 1e-9; y += stepY) {
    const yy = y;
    slice(xmin, xmax, zmin, zmax, (a, b) => [a, yy, b]);
  }
  for (let z = first(zmin, stepZ); z <= zmax + 1e-9; z += stepZ) {
    const zz = z;
    slice(xmin, xmax, ymin, ymax, (a, b) => [a, b, zz]);
  }

  const radius = opts.radius || 1;
  return twoSided(polys, radius * LIFT * 2.2);
}
