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
import { heightColor } from './terrain.js';

export const COLOR_DX = 0x2f7bff;      // blue   — ∂f/∂x
export const COLOR_DY = 0xff3b30;      // red    — ∂f/∂y
export const COLOR_GRAD = 0x14d6c8;    // teal   — gradient
export const COLOR_DIR = 0xffc531;     // amber  — directional derivative

/* ---------------------------------------------------------- level curves */

/**
 * Contour levels.
 *
 * `step` is the interval the user asked for. When it is absent we fall back to
 * a round number giving roughly `target` levels — but the interval is a
 * parameter of the exercise, not a decision for the program to make, so the UI
 * always shows the number in force and lets it be overridden.
 */
export function chooseLevels(zmin, zmax, options) {
  const o = options || {};
  const span = zmax - zmin;
  if (!(span > 0)) return { levels: [], step: 0, clamped: false };

  let step = o.step;
  if (!(step > 0)) {
    const target = o.target || 40;
    const raw = span / target;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  }

  // A tiny interval on a tall surface can ask for a million paths. Refuse
  // politely rather than freezing the browser, and say so in the interface.
  const maxLevels = o.maxLevels || 320;
  let clamped = false;
  if (span / step > maxLevels) {
    step = span / maxLevels;
    clamped = true;
  }

  const levels = [];
  const first = Math.ceil(zmin / step) * step;
  for (let v = first; v <= zmax + step * 1e-6; v += step) {
    // Re-round to kill floating point dust like 0.30000000000000004.
    levels.push(parseFloat(v.toPrecision(12)));
  }
  return { levels, step, clamped };
}

/* ------------------------------------------------- ribbons on the surface */

/**
 * Append one quad of a path lying on the surface, from (x0,y0) to (x1,y1) at a
 * fixed height.
 *
 * Both ends are extended by half the width along the path. Marching squares
 * hands back one short segment per grid cell, and without that overlap every
 * corner between consecutive segments would show a notch; with it, the quads
 * cover each other's joints and the result reads as a continuous walkway.
 */
function pushPathQuad(field, pos, col, idx, x0, y0, x1, y1, z, half, lift, rgb) {
  const ax = field.worldX(x0), az = field.worldZ(y0);
  const bx = field.worldX(x1), bz = field.worldZ(y1);
  let tx = bx - ax, tz = bz - az;
  const len = Math.hypot(tx, tz);
  if (!(len > 1e-9)) return;
  tx /= len; tz /= len;

  // The path is level, so its own tangent is horizontal; the sideways
  // direction is simply the horizontal perpendicular.
  const sx = -tz * half, sz = tx * half;
  const ex = tx * half, ez = tz * half;
  const wy = field.worldY(z) + lift;

  const v = pos.length / 3;
  pos.push(
    ax - ex + sx, wy, az - ez + sz,
    bx + ex + sx, wy, bz + ez + sz,
    bx + ex - sx, wy, bz + ez - sz,
    ax - ex - sx, wy, az - ez - sz,
  );
  for (let i = 0; i < 4; i++) col.push(rgb[0], rgb[1], rgb[2]);
  idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
}

/**
 * Marching squares over the grid, emitted as wide paths rather than hairlines.
 *
 * Crossings are collected per edge and paired, with the cell centre used to
 * disambiguate saddles. Each level takes its colour from the height ramp, so a
 * path's colour states its altitude.
 */
export function buildContours(field, grid, levels, options) {
  const o = options || {};
  const half = (o.width ?? 1.4) / 2;                       // world metres
  const lift = o.lift ?? Math.max(field.worldSize * 4e-4, half * 0.12);

  const { n, w } = grid;
  const pos = [];
  const col = [];
  const idx = [];
  const rgb = [0, 0, 0];

  for (const level of levels) {
    heightColor(grid.norm(level), rgb);

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
          pushPathQuad(field, pos, col, idx, pts[0].p[0], pts[0].p[1],
            pts[1].p[0], pts[1].p[1], level, half, lift, rgb);
        } else if (pts.length === 4) {
          const centre = (z0 + z1 + z2 + z3) / 4;
          const pair = (centre >= level) === b0 ? [[3, 0], [1, 2]] : [[0, 1], [2, 3]];
          for (const [ea, eb] of pair) {
            const A = pts.find((q) => q.e === ea), B = pts.find((q) => q.e === eb);
            if (A && B) {
              pushPathQuad(field, pos, col, idx, A.p[0], A.p[1], B.p[0], B.p[1],
                level, half, lift, rgb);
            }
          }
        }
      }
    }
  }

  if (idx.length === 0) return null;

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geom.setIndex(idx);
  geom.computeBoundingSphere();

  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.DoubleSide, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12,
  });

  const mesh = new THREE.Mesh(geom, mat);
  mesh.name = 'contours';
  mesh.renderOrder = 2;
  return mesh;
}

/* -------------------------------------------- the curve under your feet */

/**
 * Follow the level set of f through (x0, y0).
 *
 * Marching squares would give the same curve, but only at grid resolution and
 * only for the levels already chosen. Walking the curve directly gives a smooth
 * result at the player's exact height, which is what "the contour you are
 * standing on" has to mean if it is to update as they move.
 *
 * Each step goes along the tangent — perpendicular to the gradient — and is
 * then pulled back onto the level set by a couple of Newton corrections along
 * the gradient, so the trace does not drift off the contour over long runs.
 */
export function traceLevelCurve(field, x0, y0, options) {
  const o = options || {};
  const step = o.step || field.mathStep(2.2);
  const maxSteps = o.maxSteps || 420;
  const z0 = field.height(x0, y0);
  if (!isFinite(z0)) return [];

  const forward = [];
  const backward = [];

  for (const dir of [1, -1]) {
    const out = dir > 0 ? forward : backward;
    let px = x0, py = y0;

    for (let i = 0; i < maxSteps; i++) {
      const [gx, gy] = field.gradient(px, py);
      const gm = Math.hypot(gx, gy);
      if (!isFinite(gm) || gm < 1e-9) break;          // flat: no curve to follow

      px += dir * (-gy / gm) * step;
      py += dir * (gx / gm) * step;

      for (let k = 0; k < 2; k++) {
        const [cx, cy] = field.gradient(px, py);
        const cm2 = cx * cx + cy * cy;
        if (!(cm2 > 1e-18)) break;
        const err = field.height(px, py) - z0;
        if (!isFinite(err)) break;
        px -= cx * (err / cm2);
        py -= cy * (err / cm2);
      }

      if (!field.inDomain(px, py) || !isFinite(field.height(px, py))) break;
      out.push(px, py);

      // A closed loop has come back to where it started; stop rather than
      // lapping it forever.
      if (i > 8 && Math.hypot(px - x0, py - y0) < step * 0.75) break;
    }
  }

  const pts = [];
  for (let i = backward.length - 2; i >= 0; i -= 2) pts.push(backward[i], backward[i + 1]);
  pts.push(x0, y0);
  for (let i = 0; i < forward.length; i += 2) pts.push(forward[i], forward[i + 1]);
  return pts;
}

/** The contour through the player, redrawn as they move. */
export class LevelCurveGizmo {
  constructor(field, maxQuads = 900) {
    this.field = field;
    this.maxQuads = maxQuads;

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxQuads * 4 * 3), 3));
    const idx = new Uint16Array(maxQuads * 6);
    for (let q = 0; q < maxQuads; q++) {
      const v = q * 4;
      idx.set([v, v + 1, v + 2, v, v + 2, v + 3], q * 6);
    }
    geom.setIndex(new THREE.BufferAttribute(idx, 1));

    this.geometry = geom;
    this.material = new THREE.MeshBasicMaterial({
      color: 0xffffff, side: THREE.DoubleSide, toneMapped: false, fog: false,
      transparent: true, opacity: 0.95,
      polygonOffset: true, polygonOffsetFactor: -10, polygonOffsetUnits: -20,
    });
    this.mesh = new THREE.Mesh(geom, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    this.mesh.visible = false;
  }

  update(cx, cy, widthMetres, colorRGB) {
    const field = this.field;
    const pts = traceLevelCurve(field, cx, cy);
    if (pts.length < 4) { this.mesh.visible = false; return false; }

    const half = widthMetres / 2;
    const lift = Math.max(field.worldSize * 6e-4, half * 0.2);
    const z = field.height(cx, cy);
    const arr = this.geometry.getAttribute('position').array;

    let q = 0;
    for (let i = 0; i + 3 < pts.length && q < this.maxQuads; i += 2, q++) {
      const ax = field.worldX(pts[i]), az = field.worldZ(pts[i + 1]);
      const bx = field.worldX(pts[i + 2]), bz = field.worldZ(pts[i + 3]);
      let tx = bx - ax, tz = bz - az;
      const len = Math.hypot(tx, tz);
      if (!(len > 1e-9)) { q--; continue; }
      tx /= len; tz /= len;
      const sx = -tz * half, sz = tx * half;
      const ex = tx * half * 0.6, ez = tz * half * 0.6;
      const wy = field.worldY(z) + lift;

      const o = q * 12;
      arr[o] = ax - ex + sx; arr[o + 1] = wy; arr[o + 2] = az - ez + sz;
      arr[o + 3] = bx + ex + sx; arr[o + 4] = wy; arr[o + 5] = bz + ez + sz;
      arr[o + 6] = bx + ex - sx; arr[o + 7] = wy; arr[o + 8] = bz + ez - sz;
      arr[o + 9] = ax - ex - sx; arr[o + 10] = wy; arr[o + 11] = az - ez - sz;
    }

    // Collapse the quads we did not use, rather than resizing the buffer.
    for (let k = q * 12; k < arr.length; k++) arr[k] = 0;

    this.geometry.getAttribute('position').needsUpdate = true;
    this.geometry.setDrawRange(0, q * 6);
    this.geometry.computeBoundingSphere();
    if (colorRGB) this.material.color.setRGB(colorRGB[0], colorRGB[1], colorRGB[2]);
    this.mesh.visible = true;
    return true;
  }

  setVisible(v) { this.mesh.visible = v; }
  dispose() { this.geometry.dispose(); this.material.dispose(); }
}

/**
 * The tangent line to that contour, at the player's feet.
 *
 * A level curve keeps f constant, so its tangent is horizontal and points
 * perpendicular to the gradient. Drawing it as a straight, dead-level bar is
 * both the correct picture and a visible contrast with the curve it touches.
 */
export class TangentLineGizmo {
  constructor(field) {
    this.field = field;
    const geom = new THREE.PlaneGeometry(1, 1, 1, 1);
    geom.rotateX(-Math.PI / 2);
    this.geometry = geom;
    this.material = new THREE.MeshBasicMaterial({
      color: 0x18324a, side: THREE.DoubleSide, toneMapped: false, fog: false,
      transparent: true, opacity: 0.95,
      polygonOffset: true, polygonOffsetFactor: -12, polygonOffsetUnits: -24,
    });
    this.mesh = new THREE.Mesh(geom, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.mesh.visible = false;
  }

  update(cx, cy, lengthMetres, widthMetres) {
    const field = this.field;
    const z = field.height(cx, cy);
    const [gx, gy] = field.gradient(cx, cy);
    const gm = Math.hypot(gx, gy);
    if (!isFinite(z) || !isFinite(gm) || gm < 1e-12) { this.mesh.visible = false; return false; }

    // Tangent to the level curve in math space, then into world axes.
    const ux = -gy / gm, uy = gx / gm;
    const dirX = ux, dirZ = -uy;

    const lift = Math.max(field.worldSize * 8e-4, widthMetres * 0.3);
    this.mesh.position.set(field.worldX(cx), field.worldY(z) + lift, field.worldZ(cy));
    this.mesh.rotation.set(0, Math.atan2(dirX, dirZ), 0);
    this.mesh.scale.set(widthMetres, 1, lengthMetres);
    this.mesh.visible = true;
    return true;
  }

  setVisible(v) { this.mesh.visible = v; }
  dispose() { this.geometry.dispose(); this.material.dispose(); }
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

    const beamGeom = new THREE.CylinderGeometry(S * 0.006, S * 0.014, 1, 16, 1, true);
    this.beamMat = new THREE.MeshBasicMaterial({
      color: 0xfff2b0, transparent: true, opacity: 0.30, toneMapped: false, fog: false,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.beam = new THREE.Mesh(beamGeom, this.beamMat);

    const ringGeom = new THREE.RingGeometry(S * 0.011, S * 0.015, 48);
    ringGeom.rotateX(-Math.PI / 2);
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0xffe680, transparent: true, opacity: 0.95, toneMapped: false, fog: false,
      side: THREE.DoubleSide, depthWrite: false,
    });
    this.ring = new THREE.Mesh(ringGeom, this.ringMat);

    const ballGeom = new THREE.SphereGeometry(S * 0.0035, 16, 12);
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
    this.ring.position.set(wx, wy + field.worldSize * 0.002, wz);
    this.ball.position.set(wx, wy + field.worldSize * 0.005, wz);
    this.group.visible = true;
  }

  setVisible(v) { this.group.visible = v; }

  /**
   * @param cameraPos world position of the camera, so the beam can get out of
   *   the way. Teleporting to the optimum lands you inside the shaft, where an
   *   additive cylinder seen from within is an opaque wall across the screen.
   */
  animate(t, cameraPos) {
    const pulse = 0.22 + 0.10 * (0.5 + 0.5 * Math.sin(t * 2.0));
    let fade = 1;

    if (cameraPos) {
      const dx = cameraPos.x - this.beam.position.x;
      const dz = cameraPos.z - this.beam.position.z;
      const near = this.field.worldSize * 0.014;   // the beam's widest radius
      fade = Math.min(1, Math.max(0, (Math.hypot(dx, dz) - near) / (near * 2.5)));
    }

    this.beamMat.opacity = pulse * fade;
    this.beam.visible = fade > 0.02;
    this.ring.rotation.y = t * 0.6;
  }

  dispose() {
    for (const g of this.geoms) g.dispose();
    this.beamMat.dispose(); this.ringMat.dispose(); this.ballMat.dispose();
  }
}
