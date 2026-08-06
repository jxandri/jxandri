/**
 * analysis.js — the calculus the game is actually about.
 *
 *   * level curves, by marching squares over the sample grid
 *   * a highlighted disc around the player carrying the partial-derivative
 *     arrows, the gradient, and a free directional derivative
 *   * the tangent plane, for the zoom-in / local-linearity demonstration
 *   * numerical maximisation of f over the feasible set, with a beam of light
 *     so the optimum is visible from anywhere on the surface
 *
 * Arrows are drawn *on the surface*: each one is a ribbon of quads that follows
 * z = f(x,y) along its direction, not a straight line through the air.
 */

import * as THREE from '../vendor/three.module.js';
import { topoColor } from './terrain.js';

export const COLOR_DX = 0x2f7bff;      // blue   — ∂f/∂x
export const COLOR_DY = 0xff3b30;      // red    — ∂f/∂y
export const COLOR_GRAD = 0x14d6c8;    // teal   — gradient
export const COLOR_DIR = 0xffc531;     // amber  — directional derivative

/* ---------------------------------------------------------- level curves */

/** Pick ~`target` round-numbered contour levels spanning [zmin, zmax]. */
export function chooseLevels(zmin, zmax, target = 18) {
  const span = zmax - zmin;
  if (!(span > 0)) return [];
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;

  const levels = [];
  const first = Math.ceil(zmin / step) * step;
  for (let v = first; v <= zmax + step * 1e-6; v += step) {
    // Re-round to kill floating point dust like 0.30000000000000004.
    levels.push(parseFloat(v.toPrecision(12)));
  }
  return { levels, step };
}

/**
 * Marching squares over the grid. Crossings are collected per edge and paired,
 * with the cell centre used to disambiguate saddles.
 */
export function buildContours(field, grid, levels) {
  const { n, w } = grid;
  const positions = [];
  const colors = [];
  const c = [0, 0, 0];
  const wet = grid.zmin < 0 ? Math.min(1, (0 - grid.zmin) / (grid.zmax - grid.zmin)) : 0;
  const lift = field.worldSize * 0.0016; // keep lines off the surface

  const nrmCache = new THREE.Vector3();

  const emit = (x, y, z) => {
    field.worldNormal(x, y, nrmCache);
    positions.push(
      field.worldX(x) + nrmCache.x * lift,
      field.worldY(z) + nrmCache.y * lift,
      field.worldZ(y) + nrmCache.z * lift,
    );
    colors.push(c[0], c[1], c[2]);
  };

  for (const level of levels) {
    topoColor(grid.norm(level), wet, c);
    // Darken slightly so the line reads against the same tint on the surface.
    c[0] *= 0.55; c[1] *= 0.55; c[2] *= 0.55;

    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const ka = j * w + i, kb = j * w + i + 1, kc = (j + 1) * w + i + 1, kd = (j + 1) * w + i;
        if (!(grid.valid[ka] && grid.valid[kb] && grid.valid[kc] && grid.valid[kd])) continue;

        const z0 = grid.z[ka], z1 = grid.z[kb], z2 = grid.z[kc], z3 = grid.z[kd];
        const x0 = grid.x(i), x1 = grid.x(i + 1), y0 = grid.y(j), y1 = grid.y(j + 1);

        const b0 = z0 >= level, b1 = z1 >= level, b2 = z2 >= level, b3 = z3 >= level;
        if (b0 === b1 && b1 === b2 && b2 === b3) continue;

        const pts = [];
        const lerp = (za, zb, xa, ya, xb, yb) => {
          const t = (level - za) / (zb - za);
          return [xa + (xb - xa) * t, ya + (yb - ya) * t];
        };
        if (b0 !== b1) pts.push({ e: 0, p: lerp(z0, z1, x0, y0, x1, y0) });
        if (b1 !== b2) pts.push({ e: 1, p: lerp(z1, z2, x1, y0, x1, y1) });
        if (b2 !== b3) pts.push({ e: 2, p: lerp(z2, z3, x1, y1, x0, y1) });
        if (b3 !== b0) pts.push({ e: 3, p: lerp(z3, z0, x0, y1, x0, y0) });

        if (pts.length === 2) {
          emit(pts[0].p[0], pts[0].p[1], level);
          emit(pts[1].p[0], pts[1].p[1], level);
        } else if (pts.length === 4) {
          const centre = (z0 + z1 + z2 + z3) / 4;
          const pair = (centre >= level) === b0 ? [[3, 0], [1, 2]] : [[0, 1], [2, 3]];
          for (const [ea, eb] of pair) {
            const A = pts.find((q) => q.e === ea), B = pts.find((q) => q.e === eb);
            if (A && B) { emit(A.p[0], A.p[1], level); emit(B.p[0], B.p[1], level); }
          }
        }
      }
    }
  }

  if (positions.length === 0) return null;

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geom.computeBoundingSphere();

  const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, toneMapped: false });
  const lines = new THREE.LineSegments(geom, mat);
  lines.name = 'contours';
  lines.renderOrder = 2;
  return lines;
}

/* ------------------------------------------------------- surface ribbons */

/**
 * An arrow that lies on the surface: a ribbon of quads following z = f(x,y)
 * from the centre out to the rim, capped with a cone head.
 */
class SurfaceArrow {
  constructor(color, segments = 20) {
    this.seg = segments;
    const vcount = (segments + 1) * 2;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vcount * 3), 3));
    const idx = [];
    for (let i = 0; i < segments; i++) {
      const a = i * 2, b = i * 2 + 1, cc = i * 2 + 2, d = i * 2 + 3;
      idx.push(a, cc, b, b, cc, d);
    }
    geom.setIndex(idx);

    this.material = new THREE.MeshBasicMaterial({
      color, side: THREE.DoubleSide, transparent: true, opacity: 0.95,
      depthTest: true, depthWrite: false, toneMapped: false, fog: false,
    });
    this.ribbon = new THREE.Mesh(geom, this.material);
    this.ribbon.frustumCulled = false;
    this.ribbon.renderOrder = 6;

    // Unit height, so scaling y by a length gives exactly that length.
    this.head = new THREE.Mesh(
      new THREE.ConeGeometry(1, 1, 12),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false, fog: false }),
    );
    this.head.frustumCulled = false;
    this.head.renderOrder = 6;

    this.group = new THREE.Group();
    this.group.add(this.ribbon, this.head);
    this.group.visible = false;
    this.geometry = geom;
  }

  /**
   * @param r      radius in math units
   * @param width  ribbon half-width in world metres
   * @param lift   how far above the surface to float, in world metres
   */
  update(field, cx, cy, ux, uy, r, width, lift) {
    const pos = this.geometry.getAttribute('position');
    const arr = pos.array;
    const seg = this.seg;

    const p = new THREE.Vector3();
    const nrm = new THREE.Vector3();
    const tan = new THREE.Vector3();
    const side = new THREE.Vector3();
    const prev = new THREE.Vector3();
    let ok = true;

    // Leave room at the tip for the cone head.
    const headLen = Math.min(r * 0.30, r) ;
    const shaftEnd = r - headLen * 0.9;

    for (let i = 0; i <= seg; i++) {
      const t = (i / seg) * shaftEnd;
      const x = cx + ux * t, y = cy + uy * t;
      const z = field.height(x, y);
      if (!isFinite(z)) { ok = false; break; }

      field.toWorld(x, y, z, p);
      field.worldNormal(x, y, nrm);

      if (i === 0) {
        // Tangent from a small forward step so the first quad is not degenerate.
        const z2 = field.height(cx + ux * shaftEnd / seg, cy + uy * shaftEnd / seg);
        if (!isFinite(z2)) { ok = false; break; }
        tan.set(
          field.worldX(cx + ux * shaftEnd / seg) - p.x,
          field.worldY(z2) - p.y,
          field.worldZ(cy + uy * shaftEnd / seg) - p.z,
        );
      } else {
        tan.subVectors(p, prev);
      }
      if (tan.lengthSq() < 1e-20) tan.set(ux, 0, -uy);
      tan.normalize();

      side.crossVectors(nrm, tan).normalize().multiplyScalar(width);

      const k = i * 2;
      arr[k * 3] = p.x + side.x + nrm.x * lift;
      arr[k * 3 + 1] = p.y + side.y + nrm.y * lift;
      arr[k * 3 + 2] = p.z + side.z + nrm.z * lift;
      arr[(k + 1) * 3] = p.x - side.x + nrm.x * lift;
      arr[(k + 1) * 3 + 1] = p.y - side.y + nrm.y * lift;
      arr[(k + 1) * 3 + 2] = p.z - side.z + nrm.z * lift;

      prev.copy(p);
    }

    if (!ok) { this.group.visible = false; return false; }
    pos.needsUpdate = true;
    this.geometry.computeBoundingSphere();

    // Head: sits at the rim, pointing along the surface tangent there.
    const zt = field.height(cx + ux * r, cy + uy * r);
    const zs = field.height(cx + ux * shaftEnd, cy + uy * shaftEnd);
    if (!isFinite(zt) || !isFinite(zs)) { this.group.visible = false; return false; }

    const tip = new THREE.Vector3(field.worldX(cx + ux * r), field.worldY(zt), field.worldZ(cy + uy * r));
    const bottom = new THREE.Vector3(field.worldX(cx + ux * shaftEnd), field.worldY(zs), field.worldZ(cy + uy * shaftEnd));
    field.worldNormal(cx + ux * r, cy + uy * r, nrm);
    tip.addScaledVector(nrm, lift);
    bottom.addScaledVector(nrm, lift);

    const dir = new THREE.Vector3().subVectors(tip, bottom);
    const len = Math.max(dir.length(), 1e-6);
    dir.normalize();

    this.head.position.copy(bottom).addScaledVector(dir, len * 0.5);
    this.head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    this.head.scale.set(width * 3.0, len, width * 3.0);

    this.group.visible = true;
    return true;
  }

  setVisible(v) { this.group.visible = v; }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.head.geometry.dispose();
    this.head.material.dispose();
  }
}

/**
 * The highlighted neighbourhood: a translucent disc conforming to the surface,
 * with a bright rim, plus the four arrows.
 */
export class DerivativeGizmo {
  constructor(field) {
    this.field = field;
    this.group = new THREE.Group();
    this.group.name = 'derivative-gizmo';

    // Disc: a radial fan that follows the surface.
    this.rings = 6;
    this.sectors = 48;
    const vcount = 1 + this.rings * this.sectors;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vcount * 3), 3));
    const idx = [];
    for (let s = 0; s < this.sectors; s++) {
      const s2 = (s + 1) % this.sectors;
      idx.push(0, 1 + s, 1 + s2); // centre fan
      for (let r = 0; r < this.rings - 1; r++) {
        const a = 1 + r * this.sectors + s, b = 1 + r * this.sectors + s2;
        const c = 1 + (r + 1) * this.sectors + s, d = 1 + (r + 1) * this.sectors + s2;
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

    // Rim outline.
    const rimGeom = new THREE.BufferGeometry();
    rimGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array((this.sectors + 1) * 3), 3));
    this.rimGeom = rimGeom;
    this.rim = new THREE.Line(rimGeom, new THREE.LineBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.9, toneMapped: false, fog: false }));
    this.rim.frustumCulled = false;
    this.rim.renderOrder = 6;

    this.arrowX = new SurfaceArrow(COLOR_DX);
    this.arrowY = new SurfaceArrow(COLOR_DY);
    this.arrowG = new SurfaceArrow(COLOR_GRAD);
    this.arrowU = new SurfaceArrow(COLOR_DIR);

    this.group.add(this.disc, this.rim, this.arrowX.group, this.arrowY.group, this.arrowG.group, this.arrowU.group);
    this.group.visible = false;
  }

  /**
   * @param opts { radiusMetres, showX, showY, showGrad, showDir, dirAngle }
   * @returns readouts for the HUD
   */
  update(cx, cy, opts) {
    const field = this.field;
    const r = field.mathStep(opts.radiusMetres);      // radius in math units
    const lift = Math.max(field.worldSize * 1e-4, opts.radiusMetres * 0.012);
    const width = opts.radiusMetres * 0.045;

    this._updateDisc(cx, cy, r, lift);

    const h = r * 1e-3;
    const fx = field.partialX(cx, cy, h);
    const fy = field.partialY(cx, cy, h);
    const gm = Math.hypot(fx, fy);

    const out = {
      fx, fy, gradMag: gm,
      gradDir: gm > 1e-12 ? Math.atan2(fy, fx) : NaN,
      avgX: field.averageRate(cx, cy, 1, 0, r),
      avgY: field.averageRate(cx, cy, 0, 1, r),
      avgG: NaN, dirSlope: NaN, avgDir: NaN,
      radiusMath: r,
    };

    this.arrowX.setVisible(false);
    this.arrowY.setVisible(false);
    this.arrowG.setVisible(false);
    this.arrowU.setVisible(false);

    if (opts.showX) this.arrowX.update(field, cx, cy, 1, 0, r, width, lift);
    if (opts.showY) this.arrowY.update(field, cx, cy, 0, 1, r, width, lift);

    if (opts.showGrad && gm > 1e-12) {
      const ux = fx / gm, uy = fy / gm;
      out.avgG = field.averageRate(cx, cy, ux, uy, r);
      // Double width, as the gradient is the headline vector here.
      this.arrowG.update(field, cx, cy, ux, uy, r, width * 2, lift * 1.25);
    }

    if (opts.showDir) {
      const ux = Math.cos(opts.dirAngle), uy = Math.sin(opts.dirAngle);
      out.dirSlope = fx * ux + fy * uy;
      out.avgDir = field.averageRate(cx, cy, ux, uy, r);
      out.dirAngle = opts.dirAngle;
      this.arrowU.update(field, cx, cy, ux, uy, r, width * 1.4, lift * 1.5);
    }

    return out;
  }

  _updateDisc(cx, cy, r, lift) {
    const field = this.field;
    const pos = this.discGeom.getAttribute('position');
    const arr = pos.array;
    const rimArr = this.rimGeom.getAttribute('position').array;
    const p = new THREE.Vector3();
    const nrm = new THREE.Vector3();

    const put = (k, x, y) => {
      const z = field.height(x, y);
      const zz = isFinite(z) ? z : 0;
      field.toWorld(x, y, zz, p);
      field.worldNormal(x, y, nrm);
      arr[k * 3] = p.x + nrm.x * lift * 0.5;
      arr[k * 3 + 1] = p.y + nrm.y * lift * 0.5;
      arr[k * 3 + 2] = p.z + nrm.z * lift * 0.5;
    };

    put(0, cx, cy);
    for (let ri = 0; ri < this.rings; ri++) {
      const rr = ((ri + 1) / this.rings) * r;
      for (let s = 0; s < this.sectors; s++) {
        const a = (s / this.sectors) * Math.PI * 2;
        const k = 1 + ri * this.sectors + s;
        put(k, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        if (ri === this.rings - 1) {
          rimArr[s * 3] = arr[k * 3];
          rimArr[s * 3 + 1] = arr[k * 3 + 1] + lift * 0.5;
          rimArr[s * 3 + 2] = arr[k * 3 + 2];
        }
      }
    }
    // Close the rim loop.
    rimArr[this.sectors * 3] = rimArr[0];
    rimArr[this.sectors * 3 + 1] = rimArr[1];
    rimArr[this.sectors * 3 + 2] = rimArr[2];

    pos.needsUpdate = true;
    this.rimGeom.getAttribute('position').needsUpdate = true;
    this.discGeom.computeBoundingSphere();
    this.rimGeom.computeBoundingSphere();
  }

  setVisible(v) { this.group.visible = v; }

  dispose() {
    this.discGeom.dispose();
    this.discMat.dispose();
    this.rimGeom.dispose();
    for (const a of [this.arrowX, this.arrowY, this.arrowG, this.arrowU]) a.dispose();
  }
}

/* ------------------------------------------------------- tangent plane */

/**
 * The plane z = f(p) + ∇f(p)·(u − p), drawn over the disc. Zooming the
 * character down makes the surface converge to it — that is the whole point of
 * differentiability, made visible.
 */
export class TangentPlane {
  constructor(field) {
    this.field = field;
    const geom = new THREE.PlaneGeometry(1, 1, 1, 1);
    this.material = new THREE.MeshBasicMaterial({
      color: 0xffe27a, transparent: true, opacity: 0.30,
      side: THREE.DoubleSide, depthWrite: false, toneMapped: false, fog: false,
    });
    this.mesh = new THREE.Mesh(geom, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.visible = false;
    this.geometry = geom;
  }

  update(cx, cy, radiusMetres) {
    const field = this.field;
    const r = field.mathStep(radiusMetres) * 1.6;
    const z0 = field.height(cx, cy);
    const [fx, fy] = field.gradient(cx, cy, r * 1e-3);
    if (!isFinite(z0) || !isFinite(fx) || !isFinite(fy)) { this.mesh.visible = false; return; }

    // Build the plane's basis directly in world space.
    const o = new THREE.Vector3(field.worldX(cx), field.worldY(z0), field.worldZ(cy));
    const ex = new THREE.Vector3(field.S, field.worldY(fx), 0).normalize();
    const ey = new THREE.Vector3(0, field.worldY(fy), -field.S).normalize();
    const n = new THREE.Vector3().crossVectors(ey, ex).normalize();
    if (n.y < 0) n.negate();

    const m = new THREE.Matrix4().makeBasis(ex, n, ey.clone().negate());
    this.mesh.position.copy(o);
    this.mesh.quaternion.setFromRotationMatrix(m);
    // PlaneGeometry lies in XY; rotate it into the basis' XZ.
    this.mesh.rotateX(-Math.PI / 2);
    const size = r * field.S * 2;
    this.mesh.scale.set(size, size, 1);
    this.mesh.visible = true;
  }

  setVisible(v) { this.mesh.visible = v; }
  dispose() { this.geometry.dispose(); this.material.dispose(); }
}

/* ----------------------------------------------------------- optimisation */

/**
 * Maximise f over the feasible set, numerically.
 *
 * Coarse grid scan for basins, then a shrinking pattern search from the best
 * few. Every trial point must be finite, inside the domain and feasible, so a
 * boundary optimum (the usual case for a constrained problem) is found by the
 * search simply refusing to step outside.
 */
export function maximize(field, predicate, options) {
  const o = options || {};
  const coarse = o.coarse ?? 160;
  const restarts = o.restarts ?? 8;

  const feasible = (x, y) => field.inDomain(x, y) && predicate(x, y);
  const value = (x, y) => {
    if (!feasible(x, y)) return -Infinity;
    const z = field.height(x, y);
    return isFinite(z) ? z : -Infinity;
  };

  const candidates = [];
  const dx = (field.xmax - field.xmin) / coarse;
  const dy = (field.ymax - field.ymin) / coarse;

  for (let j = 0; j <= coarse; j++) {
    const y = field.ymin + j * dy;
    for (let i = 0; i <= coarse; i++) {
      const x = field.xmin + i * dx;
      const v = value(x, y);
      if (v > -Infinity) candidates.push({ x, y, v });
    }
  }
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.v - a.v);

  // Keep well-separated starting points so multiple peaks get a look-in.
  const seeds = [];
  const minSep = Math.max(dx, dy) * 4;
  for (const c of candidates) {
    if (seeds.length >= restarts) break;
    if (seeds.every((s) => Math.hypot(s.x - c.x, s.y - c.y) > minSep)) seeds.push(c);
  }
  if (seeds.length === 0) seeds.push(candidates[0]);

  const DIRS = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071],
  ];

  let best = { x: candidates[0].x, y: candidates[0].y, v: candidates[0].v };

  for (const seed of seeds) {
    let x = seed.x, y = seed.y, v = seed.v;
    let step = Math.max(dx, dy) * 1.5;
    const tol = Math.max(dx, dy) * 1e-7;

    while (step > tol) {
      let improved = false;
      for (const [ux, uy] of DIRS) {
        const nx = x + ux * step, ny = y + uy * step;
        const nv = value(nx, ny);
        if (nv > v) { x = nx; y = ny; v = nv; improved = true; }
      }
      if (!improved) step *= 0.5;
    }
    if (v > best.v) best = { x, y, v };
  }

  const [gx, gy] = field.gradient(best.x, best.y);
  const gradMag = isFinite(gx) && isFinite(gy) ? Math.hypot(gx, gy) : NaN;

  // Interior if a small ball around it is entirely feasible.
  const probe = Math.max(dx, dy) * 0.75;
  let interior = true;
  for (const [ux, uy] of DIRS) {
    if (!feasible(best.x + ux * probe, best.y + uy * probe)) { interior = false; break; }
  }

  return { x: best.x, y: best.y, z: best.v, gradMag, interior };
}

/**
 * Marker for the optimum: a ring on the surface, a small sphere, and a shaft of
 * light running up to the sky so it can be spotted from anywhere.
 */
export class OptimumMarker {
  constructor(field) {
    this.field = field;
    this.group = new THREE.Group();
    this.group.name = 'optimum';
    this.group.visible = false;

    const S = field.worldSize;

    const beamGeom = new THREE.CylinderGeometry(S * 0.012, S * 0.030, 1, 16, 1, true);
    this.beamMat = new THREE.MeshBasicMaterial({
      color: 0xfff2b0, transparent: true, opacity: 0.30, toneMapped: false, fog: false,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.beam = new THREE.Mesh(beamGeom, this.beamMat);

    const ringGeom = new THREE.RingGeometry(S * 0.020, S * 0.028, 40);
    ringGeom.rotateX(-Math.PI / 2);
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0xffe680, transparent: true, opacity: 0.95, toneMapped: false, fog: false,
      side: THREE.DoubleSide, depthWrite: false,
    });
    this.ring = new THREE.Mesh(ringGeom, this.ringMat);

    const ballGeom = new THREE.SphereGeometry(S * 0.010, 16, 12);
    this.ballMat = new THREE.MeshBasicMaterial({ color: 0xfffbe6, toneMapped: false, fog: false });
    this.ball = new THREE.Mesh(ballGeom, this.ballMat);

    this.group.add(this.beam, this.ring, this.ball);
    this.geoms = [beamGeom, ringGeom, ballGeom];
  }

  set(x, y, z) {
    const field = this.field;
    const wx = field.worldX(x), wy = field.worldY(z), wz = field.worldZ(y);
    const top = field.worldSize * 1.15;

    this.beam.position.set(wx, wy + top / 2, wz);
    this.beam.scale.set(1, top, 1);
    this.ring.position.set(wx, wy + field.worldSize * 0.004, wz);
    this.ball.position.set(wx, wy + field.worldSize * 0.012, wz);
    this.group.visible = true;
  }

  setVisible(v) { this.group.visible = v; }

  animate(t) {
    this.beamMat.opacity = 0.22 + 0.10 * (0.5 + 0.5 * Math.sin(t * 2.0));
    this.ring.rotation.y = t * 0.6;
  }

  dispose() {
    for (const g of this.geoms) g.dispose();
    this.beamMat.dispose(); this.ringMat.dispose(); this.ballMat.dispose();
  }
}
