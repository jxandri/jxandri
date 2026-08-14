/**
 * intrinsic.js — the derivatives of a surface that has no f.
 *
 * On a graph everything in analysis.js is written in terms of the plane
 * underneath: the neighbourhood is a disc in (x, y) pushed up, the partial
 * derivatives are rates of change of f along the axes of that plane, the
 * tangent plane is a graph over it. A torus has no plane underneath. Every one
 * of those objects still exists — they are the objects of the surface itself —
 * but each has to be built out of things a surface has: geodesics, arc length,
 * the tangent plane, parallel transport.
 *
 *   neighbourhood   the geodesic circle: the set of points reached by walking
 *       r metres from the explorer along a straightest path, in every direction.
 *       On a sphere that is a circle of latitude about them; on a saddle it is a
 *       wavy thing that is not any circle in space. Its circumference is 2πr
 *       only in the flat case, and how it falls short is the Gaussian curvature
 *       — Bertrand–Puiseux, visible on screen.
 *
 *   directional derivative   the velocity itself. On a graph D_u f is a number,
 *       the slope you feel walking along u. Here there is no height to have a
 *       slope, and what is left is the thing that number was a derivative *of*:
 *       γ'(0), the tangent vector to the path the explorer is walking. It is
 *       tangent to the surface by construction, and it is drawn along the
 *       geodesic it generates.
 *
 *   partial derivatives   the same, along the coordinate directions of whichever
 *       grid is being drawn. That is what makes them *partial*: on a graph the
 *       grid is the Cartesian one and the two directions are ∂/∂x and ∂/∂y; on a
 *       parametric patch they are ∂r/∂u and ∂r/∂v, which for the usual sphere
 *       are longitude and latitude; on an implicit surface they are the
 *       directions in which the ambient x and y increase while staying on the
 *       surface; and with the geodesic grid on, they are its two axes. Change
 *       the grid and these arrows change with it, because the question "what is
 *       the partial derivative here" has no answer until a coordinate system is
 *       named. Vectors, not numbers, and tangent to the surface — the covariant
 *       ones, not the ambient derivative that points off into space.
 *
 *   tangent plane   T_pS itself, the plane those vectors live in.
 *
 * Everything here is drawn from a SurfaceWalker and puts it back exactly where
 * it was found: these are questions asked of the surface, not walks taken on it.
 */

import * as THREE from '../vendor/three.module.js';
import { COLOR_DX, COLOR_DY, COLOR_DIR } from './analysis.js';

export { COLOR_DX, COLOR_DY, COLOR_DIR };

/* ------------------------------------------------------------ ribbons */

/**
 * An arrow laid along a geodesic: a ribbon of quads that follows the surface,
 * narrow along the shaft and flaring into a flat head — the same arrow the
 * heightfield draws, built from a walk instead of from a height function.
 *
 * A tangent vector is a straight arrow in the tangent plane, and drawn that way
 * it would leave the surface immediately on anything curved. Drawn along the
 * geodesic it generates it stays on the surface, agrees with the straight arrow
 * to first order at the explorer's feet, and its tip lands exactly on the
 * geodesic circle of the same radius — so the arrows and the neighbourhood are
 * one picture. The tangent plane is drawn separately, and that is where the
 * straight version can be seen.
 */
class GeodesicArrow {
  constructor(color, segments = 14) {
    this.seg = segments;
    this.rows = segments + 3;              // shaft, barbs, tip
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position',
      new THREE.BufferAttribute(new Float32Array(this.rows * 2 * 3), 3));
    const idx = [];
    for (let i = 0; i < this.rows - 1; i++) {
      const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
      idx.push(a, c, b, b, c, d);
    }
    geom.setIndex(idx);
    this.geometry = geom;

    this.material = new THREE.MeshBasicMaterial({
      color, side: THREE.DoubleSide, transparent: true, opacity: 0.95,
      depthWrite: false, toneMapped: false, fog: false,
    });
    this.mesh = new THREE.Mesh(geom, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.visible = false;
  }

  /**
   * @param ray    samples from SurfaceWalker.ray — [{ s, p, n }]
   * @param length arc length the arrow should reach
   * @param width  shaft half-width, world metres
   * @param lift   clearance along the normal, world metres
   */
  set(ray, length, width, lift) {
    if (!ray || ray.length < 2 || !(length > 0)) { this.mesh.visible = false; return false; }
    const reach = ray[ray.length - 1].s;
    if (!(reach > length * 0.5)) { this.mesh.visible = false; return false; }
    const L = Math.min(length, reach);

    // Draughtsman's proportions, tied to the shaft's width rather than to the
    // arrow's length, so a short arrow and a long one look like the same arrow.
    const headWidth = width * 2.2;
    const headLen = Math.min(headWidth * 1.5, L * 0.22);
    const shaft = Math.max(L * 0.4, L - headLen);

    const ts = new Array(this.rows), hw = new Array(this.rows);
    for (let i = 0; i <= this.seg; i++) { ts[i] = (i / this.seg) * shaft; hw[i] = width; }
    ts[this.seg + 1] = shaft; hw[this.seg + 1] = headWidth;
    ts[this.seg + 2] = L; hw[this.seg + 2] = width * 0.06;

    const arr = this.geometry.getAttribute('position').array;
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    const q = new THREE.Vector3(), nn = new THREE.Vector3();
    const tan = new THREE.Vector3(), side = new THREE.Vector3();
    const eps = Math.max(L * 1e-2, 1e-9);

    for (let i = 0; i < this.rows; i++) {
      sampleRay(ray, ts[i], p, n);
      // Tangent from the ray itself: a central difference in arc length, which
      // stays sane at the two rows that share a parameter (the shoulder).
      sampleRay(ray, Math.max(0, ts[i] - eps), q, nn);
      sampleRay(ray, Math.min(reach, ts[i] + eps), tan, nn);
      tan.sub(q);
      if (tan.lengthSq() < 1e-24) { this.mesh.visible = false; return false; }
      tan.normalize();
      side.crossVectors(n, tan).normalize().multiplyScalar(hw[i]);

      const k = i * 6;
      arr[k] = p.x + side.x + n.x * lift;
      arr[k + 1] = p.y + side.y + n.y * lift;
      arr[k + 2] = p.z + side.z + n.z * lift;
      arr[k + 3] = p.x - side.x + n.x * lift;
      arr[k + 4] = p.y - side.y + n.y * lift;
      arr[k + 5] = p.z - side.z + n.z * lift;
    }

    this.geometry.getAttribute('position').needsUpdate = true;
    this.geometry.computeBoundingSphere();
    this.mesh.visible = true;
    return true;
  }

  setVisible(v) { this.mesh.visible = v; }
  dispose() { this.geometry.dispose(); this.material.dispose(); }
}

/**
 * Where a ray is at arc length `s`, by linear interpolation between samples.
 *
 * The samples are already close together — flow is asked for at least eight
 * steps however short the run — so linear is right to well under a pixel, and
 * anything fancier would be interpolating the integrator's own error.
 */
function sampleRay(ray, s, outP, outN) {
  const last = ray.length - 1;
  if (!(s > ray[0].s)) { outP.copy(ray[0].p); outN.copy(ray[0].n); return; }
  if (s >= ray[last].s) { outP.copy(ray[last].p); outN.copy(ray[last].n); return; }
  let i = 1;
  while (i < last && ray[i].s < s) i++;
  const a = ray[i - 1], b = ray[i];
  const span = b.s - a.s;
  const t = span > 1e-12 ? (s - a.s) / span : 0;
  outP.copy(a.p).lerp(b.p, t);
  outN.copy(a.n).lerp(b.n, t);
  if (outN.lengthSq() < 1e-18) outN.copy(b.n);
  outN.normalize();
}

/* --------------------------------------------------------- the circle */

/**
 * The geodesic circle of radius r about the explorer, filled in.
 *
 * One geodesic per sector, each walked out to r and sampled on the way, then
 * the rings read off at fractions of the radius. The rim is therefore the set
 * of points at geodesic distance exactly r — the honest neighbourhood, which on
 * a curved surface is not the image of a circle under anything.
 *
 * It is rebuilt only when the explorer has actually moved, or the radius has
 * changed: a few hundred retractions is cheap once and wasteful sixty times a
 * second, and the geometry is in world space, so between rebuilds it simply
 * stays where it was put.
 */
export class GeodesicDisc {
  constructor(sectors = 36, rings = 4) {
    this.sectors = sectors;
    this.rings = rings;
    this.group = new THREE.Group();
    this.group.name = 'geodesic-disc';
    this.group.visible = false;

    const vcount = 1 + rings * sectors;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vcount * 3), 3));
    const idx = [];
    for (let s = 0; s < sectors; s++) {
      const s2 = (s + 1) % sectors;
      idx.push(0, 1 + s, 1 + s2);
      for (let r = 0; r < rings - 1; r++) {
        const a = 1 + r * sectors + s, b = 1 + r * sectors + s2;
        const c = 1 + (r + 1) * sectors + s, d = 1 + (r + 1) * sectors + s2;
        idx.push(a, c, b, b, c, d);
      }
    }
    geom.setIndex(idx);
    this.discGeom = geom;
    this.discMat = new THREE.MeshBasicMaterial({
      color: 0xfff3c4, transparent: true, opacity: 0.22,
      side: THREE.DoubleSide, depthWrite: false, toneMapped: false, fog: false,
    });
    this.disc = new THREE.Mesh(geom, this.discMat);
    this.disc.frustumCulled = false;
    this.disc.renderOrder = 5;

    const rimGeom = new THREE.BufferGeometry();
    rimGeom.setAttribute('position',
      new THREE.BufferAttribute(new Float32Array((sectors + 1) * 3), 3));
    this.rimGeom = rimGeom;
    this.rimMat = new THREE.LineBasicMaterial({
      color: 0xfff0b0, transparent: true, opacity: 0.9, toneMapped: false, fog: false,
    });
    this.rim = new THREE.Line(rimGeom, this.rimMat);
    this.rim.frustumCulled = false;
    this.rim.renderOrder = 6;

    this.group.add(this.disc, this.rim);

    this._at = new THREE.Vector3(NaN, NaN, NaN);
    this._e1 = new THREE.Vector3();
    this._r = -1;
    this._lift = -1;
    this.circumference = NaN;
  }

  /**
   * @returns { circumference, ratio } — the length of the rim, and how it
   *   compares with 2πr. Below 1 the surface curves like a sphere, above it
   *   like a saddle, and the gap is the curvature: C = 2πr(1 − K r²/6 + …).
   */
  update(walker, radiusMetres, lift) {
    if (!walker || !(radiusMetres > 0)) { this.group.visible = false; return null; }
    const p0 = walker.position(new THREE.Vector3());
    const { e1, e2 } = walker.gridFrame();

    const moved = !isFinite(this._at.x) || p0.distanceTo(this._at) > radiusMetres * 0.02;
    const turned = e1.distanceTo(this._e1) > 0.02;
    if (!moved && !turned && Math.abs(this._r - radiusMetres) < radiusMetres * 1e-3
      && Math.abs(this._lift - lift) < 1e-9) {
      this.group.visible = true;
      return this._last;
    }

    const saved = walker.snapshot();
    const arr = this.discGeom.getAttribute('position').array;
    const rimArr = this.rimGeom.getAttribute('position').array;
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    const n0 = walker.normal(new THREE.Vector3());
    let circumference = 0;
    const rimPts = [];
    let ok = true;

    arr[0] = p0.x + n0.x * lift * 0.75;
    arr[1] = p0.y + n0.y * lift * 0.75;
    arr[2] = p0.z + n0.z * lift * 0.75;

    try {
      for (let s = 0; s < this.sectors; s++) {
        const a = (s / this.sectors) * Math.PI * 2;
        const dir = new THREE.Vector3()
          .addScaledVector(e1, Math.cos(a))
          .addScaledVector(e2, Math.sin(a));
        walker.restore(saved);
        const ray = walker.ray(dir, radiusMetres, this.rings * 2);
        if (ray.length < 2) { ok = false; break; }

        for (let ri = 0; ri < this.rings; ri++) {
          sampleRay(ray, ((ri + 1) / this.rings) * radiusMetres, p, n);
          const k = 1 + ri * this.sectors + s;
          arr[k * 3] = p.x + n.x * lift * 0.75;
          arr[k * 3 + 1] = p.y + n.y * lift * 0.75;
          arr[k * 3 + 2] = p.z + n.z * lift * 0.75;
          if (ri === this.rings - 1) {
            rimArr[s * 3] = arr[k * 3];
            rimArr[s * 3 + 1] = arr[k * 3 + 1] + lift * 0.5;
            rimArr[s * 3 + 2] = arr[k * 3 + 2];
            rimPts.push(p.clone());
          }
        }
      }
    } finally {
      walker.restore(saved);
    }

    if (!ok || rimPts.length !== this.sectors) { this.group.visible = false; return null; }

    rimArr[this.sectors * 3] = rimArr[0];
    rimArr[this.sectors * 3 + 1] = rimArr[1];
    rimArr[this.sectors * 3 + 2] = rimArr[2];
    for (let i = 0; i < rimPts.length; i++) {
      circumference += rimPts[i].distanceTo(rimPts[(i + 1) % rimPts.length]);
    }

    this.discGeom.getAttribute('position').needsUpdate = true;
    this.rimGeom.getAttribute('position').needsUpdate = true;
    this.discGeom.computeBoundingSphere();
    this.rimGeom.computeBoundingSphere();
    this.group.visible = true;

    this._at.copy(p0);
    this._e1.copy(e1);
    this._r = radiusMetres;
    this._lift = lift;
    this._last = {
      circumference,
      ratio: circumference / (2 * Math.PI * radiusMetres),
    };
    return this._last;
  }

  setVisible(v) { this.group.visible = v; }

  dispose() {
    this.discGeom.dispose(); this.discMat.dispose();
    this.rimGeom.dispose(); this.rimMat.dispose();
  }
}

/* --------------------------------------------------------- the plane */

/**
 * T_pS — the tangent plane at the explorer's feet, as a square of it.
 *
 * Drawn straight, in space, because that is what it is: the plane the velocity
 * and the coordinate vectors actually live in. Against the arrows, which curve
 * away along the surface, it shows exactly what tangency costs — they agree at
 * the explorer and part company at second order, and shrinking the explorer
 * closes the gap. That is differentiability, on a surface with no graph.
 */
export class TangentPatch {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'tangent-patch';
    this.group.visible = false;

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4 * 3), 3));
    geom.setIndex([0, 1, 2, 0, 2, 3]);
    this.geometry = geom;
    this.material = new THREE.MeshBasicMaterial({
      color: 0xffe27a, transparent: true, opacity: 0.30,
      side: THREE.DoubleSide, depthWrite: false, toneMapped: false, fog: false,
    });
    this.mesh = new THREE.Mesh(geom, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;

    const rimGeom = new THREE.BufferGeometry();
    rimGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(5 * 3), 3));
    this.rimGeom = rimGeom;
    this.rimMat = new THREE.LineBasicMaterial({
      color: 0xffe27a, transparent: true, opacity: 0.85, toneMapped: false, fog: false,
    });
    this.rim = new THREE.Line(rimGeom, this.rimMat);
    this.rim.frustumCulled = false;
    this.rim.renderOrder = 5;

    this.group.add(this.mesh, this.rim);
  }

  /**
   * @param half  half-width of the square, in world metres
   * @param lift  clearance along the normal — a small lie, told so that over a
   *   dome the plane is not buried in the ground it is tangent to
   */
  update(walker, half, lift) {
    if (!walker || !(half > 0)) { this.group.visible = false; return false; }
    const p = walker.position(new THREE.Vector3());
    const { n, e1, e2 } = walker.gridFrame();
    p.addScaledVector(n, lift);

    const arr = this.geometry.getAttribute('position').array;
    const rimArr = this.rimGeom.getAttribute('position').array;
    const c = new THREE.Vector3();
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let i = 0; i < 4; i++) {
      c.copy(p)
        .addScaledVector(e1, corners[i][0] * half)
        .addScaledVector(e2, corners[i][1] * half);
      arr[i * 3] = c.x; arr[i * 3 + 1] = c.y; arr[i * 3 + 2] = c.z;
      rimArr[i * 3] = c.x; rimArr[i * 3 + 1] = c.y; rimArr[i * 3 + 2] = c.z;
    }
    rimArr[12] = rimArr[0]; rimArr[13] = rimArr[1]; rimArr[14] = rimArr[2];

    this.geometry.getAttribute('position').needsUpdate = true;
    this.rimGeom.getAttribute('position').needsUpdate = true;
    this.geometry.computeBoundingSphere();
    this.rimGeom.computeBoundingSphere();
    this.group.visible = true;
    return true;
  }

  setVisible(v) { this.group.visible = v; }

  dispose() {
    this.geometry.dispose(); this.material.dispose();
    this.rimGeom.dispose(); this.rimMat.dispose();
  }
}

/* -------------------------------------------------- coordinate directions */

/** World directions of math x and math y: math +y points along world −Z. */
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 0, -1);

/**
 * The two coordinate directions of whichever grid is being drawn, at the
 * explorer's feet, as unit tangent vectors.
 *
 * @param mode 'param'    the parameter lines of r(u, v)
 *             'coord'    the ambient x and y, projected onto the tangent plane
 *             'geodesic' the axes of the geodesic grid, parallel-transported
 *
 * A direction can genuinely fail to exist, and then it is reported missing
 * rather than faked. Where a sphere x² + y² + z² = 1 meets the plane x = 1 the
 * surface is tangent to that plane: x is stationary there, "the direction in
 * which x increases" is no direction at all, and the projection of the x axis
 * onto the tangent plane is the zero vector. Nothing is drawn, and the readout
 * says the axis is perpendicular to the surface.
 */
export function gridDirections(walker, mode) {
  const n = walker.normal(new THREE.Vector3());
  const flatten = (v) => {
    const w = v.clone().addScaledVector(n, -v.dot(n));
    return w.lengthSq() > 1e-12 ? w.normalize() : null;
  };

  if (mode === 'geodesic') {
    const { e1, e2 } = walker.gridFrame();
    return { a: e1, b: e2, keys: ['geo1', 'geo2'] };
  }
  if (mode === 'param' && walker.basis) {
    const { ru, rv } = walker.basis();
    return {
      a: ru.lengthSq() > 1e-20 ? flatten(ru) : null,
      b: rv.lengthSq() > 1e-20 ? flatten(rv) : null,
      keys: ['ru', 'rv'],
    };
  }
  return { a: flatten(AXIS_X), b: flatten(AXIS_Y), keys: ['ax', 'ay'] };
}

/* ------------------------------------------------------------- the set */

/**
 * The whole apparatus, assembled: the geodesic circle, the two coordinate
 * arrows, the velocity, and the tangent plane. One object so that the caller
 * has one thing to add to the scene, show, hide and dispose.
 */
export class IntrinsicGizmo {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'intrinsic-gizmo';

    this.disc = new GeodesicDisc();
    this.patch = new TangentPatch();
    this.arrowA = new GeodesicArrow(COLOR_DX);
    this.arrowB = new GeodesicArrow(COLOR_DY);
    this.arrowV = new GeodesicArrow(COLOR_DIR);

    this.group.add(this.disc.group, this.patch.group,
      this.arrowA.mesh, this.arrowB.mesh, this.arrowV.mesh);
    this.lift = 0;
  }

  /**
   * @param opts { radiusMetres, gridMode, showDisc, showA, showB, showVel,
   *               showPlane, clearance }
   * @returns readouts for the HUD
   */
  update(walker, opts) {
    const L = opts.radiusMetres;
    const out = { angleAB: NaN, headingAngle: NaN, circumference: NaN, ratio: NaN };
    if (!walker || !(L > 0)) { this.group.visible = false; return out; }
    this.group.visible = true;

    // The arrows and the disc are drawn on the surface, so they have to clear
    // it: the flat quads between samples cut under a dome, and whatever the
    // caller is already floating underfoot has to be cleared too.
    const lift = Math.max(L * 0.02, (opts.clearance || 0) * 2.6);
    this.lift = lift;
    const width = L * 0.020;

    if (opts.showDisc) {
      const r = this.disc.update(walker, L, lift);
      if (r) { out.circumference = r.circumference; out.ratio = r.ratio; }
    } else {
      this.disc.setVisible(false);
    }

    const { a, b } = gridDirections(walker, opts.gridMode);
    out.hasA = !!a;
    out.hasB = !!b;
    if (a && b) out.angleAB = a.angleTo(b);

    const arm = (arrow, dir, w, lf) => {
      if (!dir) { arrow.setVisible(false); return; }
      const ray = walker.ray(dir, L, 12);
      arrow.set(ray, L, w, lf);
    };

    if (opts.showA) arm(this.arrowA, a, width, lift * 1.15); else this.arrowA.setVisible(false);
    if (opts.showB) arm(this.arrowB, b, width, lift * 1.3); else this.arrowB.setVisible(false);

    if (opts.showVel) {
      // The velocity is the direction the body is travelling — the heading
      // swung by however far the explorer is strafing — which is exactly what
      // the character is facing. Not the heading itself: strafe around a torus
      // and the velocity points sideways while the eyes still point forwards.
      const fr = walker.frame();
      const v = walker.facing ? walker.facing(fr) : fr.fwd;
      arm(this.arrowV, v.clone().normalize(), width * 1.4, lift * 1.55);
      if (a) {
        const side = new THREE.Vector3().crossVectors(fr.n, a);
        out.headingAngle = Math.atan2(v.dot(side), v.dot(a));
      }
    } else {
      this.arrowV.setVisible(false);
    }

    if (opts.showPlane) this.patch.update(walker, L * 1.25, lift * 1.6);
    else this.patch.setVisible(false);

    return out;
  }

  setVisible(v) { this.group.visible = v; }

  dispose() {
    this.disc.dispose();
    this.patch.dispose();
    for (const a of [this.arrowA, this.arrowB, this.arrowV]) a.dispose();
  }
}
