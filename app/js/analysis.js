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
import { heatColor } from './terrain.js';

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
 * Append one quad of a path draped on the surface, from (x0,y0) to (x1,y1).
 *
 * The *centreline* of a level curve is at constant height — that is what makes
 * it a level curve — but the path has width, and across that width the ground
 * rises on one side and falls on the other. Holding all four corners at the
 * same z would float a flat ring parallel to the (x, y) plane, cutting into the
 * hillside above and hanging in the air below. So each corner is put at the
 * height of the surface beneath *it*, and the band lies on the hill like a
 * footpath, which is what it is.
 *
 * Both ends are extended by half the width along the path. Marching squares
 * hands back one short segment per grid cell, and without that overlap every
 * corner between consecutive segments would show a notch; with it, the quads
 * cover each other's joints and the result reads as a continuous walkway.
 */
function pushPathQuad(field, sampleZ, pos, col, idx, x0, y0, x1, y1, z, half, lift, rgb) {
  const ax = field.worldX(x0), az = field.worldZ(y0);
  const bx = field.worldX(x1), bz = field.worldZ(y1);
  let tx = bx - ax, tz = bz - az;
  const len = Math.hypot(tx, tz);
  if (!(len > 1e-9)) return;
  tx /= len; tz /= len;

  const sx = -tz * half, sz = tx * half;
  const ex = tx * half, ez = tz * half;
  const flat = field.worldY(z) + lift;

  // World X/Z of the four corners, then the ground under each of them.
  const cs = [
    [ax - ex + sx, az - ez + sz],
    [bx + ex + sx, bz + ez + sz],
    [bx + ex - sx, bz + ez - sz],
    [ax - ex - sx, az - ez - sz],
  ];

  const v = pos.length / 3;
  for (const [wx, wz] of cs) {
    const zz = sampleZ(field.mathX(wx), field.mathY(wz));
    pos.push(wx, isFinite(zz) ? field.worldY(zz) + lift : flat, wz);
    col.push(rgb[0], rgb[1], rgb[2]);
  }
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

  // Marching squares can be run on a finer lattice than the render mesh, and
  // on real terrain it should be. The mesh is sized for triangles the eye can
  // accept; a contour is a *curve*, and the eye is far less forgiving about a
  // curve — the same cell that looks smooth as shaded ground reads as a
  // staircase when a thin band traces its diagonal. `refine` re-samples f
  // between mesh nodes, which costs a few thousand extra evaluations once and
  // buys level curves that look like the differentiable curves they are.
  const refine = Math.max(1, Math.round(o.refine || 1));
  const n = grid.n * refine;
  const x0g = grid.x(0), y0g = grid.y(0);
  const dx = (grid.x(grid.n) - x0g) / n, dy = (grid.y(grid.n) - y0g) / n;
  const gx = (i) => x0g + i * dx;
  const gy = (j) => y0g + j * dy;

  // One row of samples at a time, so a refined lattice never holds more than
  // two rows of f in memory however fine it is.
  const rowZ = (j) => {
    const out = new Float64Array(n + 1);
    const y = gy(j);
    for (let i = 0; i <= n; i++) {
      const z = refine === 1 ? grid.z[j * grid.w + i] : field.height(gx(i), y);
      out[i] = z;
    }
    return out;
  };
  const rowOk = (j, z) => {
    const out = new Uint8Array(n + 1);
    const y = gy(j);
    for (let i = 0; i <= n; i++) {
      out[i] = (isFinite(z[i]) && (refine === 1 ? grid.valid[j * grid.w + i] : field.inDomain(gx(i), y))) ? 1 : 0;
    }
    return out;
  };

  // Only inside the feasible set, when asked. Level curves of a utility
  // function drawn over a budget set are indifference curves, and the picture
  // an economics course draws stops at the budget line — everything outside it
  // is not part of the problem.
  const keep = o.only || null;

  const pos = [];
  const col = [];
  const idx = [];
  const rgb = [0, 0, 0];

  // Drape on the *rendered* triangles rather than on f itself: a bilinear look
  // up into samples we already hold, and it costs nothing per corner.
  const sampleZ = (x, y) => grid.meshHeight(x, y);

  // Every level curve in the heat ramp, blue at the bottom of the window to
  // red at the top — the same ramp the flat map's contours use, so a curve in
  // the scene and the same curve on the map are the same colour.
  for (const level of levels) {
    heatColor(grid.norm(level), rgb);

    let zA = rowZ(0), okA = rowOk(0, zA);
    for (let j = 0; j < n; j++) {
      const zB = rowZ(j + 1), okB = rowOk(j + 1, zB);
      for (let i = 0; i < n; i++) {
        if (!(okA[i] && okA[i + 1] && okB[i + 1] && okB[i])) continue;

        const z0 = zA[i], z1 = zA[i + 1], z2 = zB[i + 1], z3 = zB[i];
        const x0 = gx(i), x1 = gx(i + 1), y0 = gy(j), y1 = gy(j + 1);

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

        const draw = (A, B) => {
          // Clipped at the frontier rather than faded at it: a segment with one
          // end outside is cut where it crosses, so the curve stops exactly on
          // the constraint the way a drawn indifference curve does.
          let ax = A[0], ay = A[1], bx = B[0], by = B[1];
          if (keep) {
            const ia = keep(ax, ay), ib = keep(bx, by);
            if (!ia && !ib) return;
            if (ia !== ib) {
              // bisect to the crossing; a dozen halvings is far below a pixel
              let lo = 0, hi = 1;
              for (let k = 0; k < 14; k++) {
                const m = (lo + hi) / 2;
                if (keep(ax + (bx - ax) * m, ay + (by - ay) * m) === ia) lo = m; else hi = m;
              }
              const t = (lo + hi) / 2;
              const cx = ax + (bx - ax) * t, cy = ay + (by - ay) * t;
              if (ia) { bx = cx; by = cy; } else { ax = cx; ay = cy; }
            }
          }
          pushPathQuad(field, sampleZ, pos, col, idx, ax, ay, bx, by, level, half, lift, rgb);
        };

        if (pts.length === 2) {
          draw(pts[0].p, pts[1].p);
        } else if (pts.length === 4) {
          const centre = (z0 + z1 + z2 + z3) / 4;
          const pair = (centre >= level) === b0 ? [[3, 0], [1, 2]] : [[0, 1], [2, 3]];
          for (const [ea, eb] of pair) {
            const A = pts.find((q) => q.e === ea), B = pts.find((q) => q.e === eb);
            if (A && B) draw(A.p, B.p);
          }
        }
      }
      zA = zB; okA = okB;
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

/**
 * The same walk, along the zero set of an arbitrary g rather than a level set
 * of f: the *frontier* through a point.
 *
 * This is what "walk the frontier" needs in order to mean what a student
 * expects. A constraint formula's zero set is not one curve — the
 * <em>section</em> of it that matters is the connected arc the constrained
 * optimum lies on, and the rest of the set, wherever else in the window it
 * happens to pass, is not part of the problem. Newton projection alone cannot
 * tell those apart: it lands on whatever branch is nearest, so an explorer
 * roped to "the frontier" could be put down on a piece of curve nowhere near
 * the answer, and could hop to another piece by walking past a pinch.
 *
 * Tracing gives the arc explicitly, and once you have it you can also stop at
 * its ends rather than sliding along an extension of it that does not exist.
 *
 * @param field  for the domain, and for refusing ground where f is undefined
 * @param g      the constraint, as g(x, y) whose zero set is the frontier
 * @returns { pts: [x, y, …], closed } or null
 */
export function traceZeroSet(field, g, x0, y0, options) {
  const o = options || {};
  const span = Math.min(field.xmax - field.xmin, field.ymax - field.ymin);
  const step = o.step || span / 500;
  const maxSteps = o.maxSteps || 3000;
  const h = Math.max(1e-9, span * 1e-5);

  const grad = (x, y) => [
    (g(x + h, y) - g(x - h, y)) / (2 * h),
    (g(x, y + h) - g(x, y - h)) / (2 * h),
  ];

  // Start exactly on the curve, whatever was handed in.
  let sx = x0, sy = y0;
  for (let k = 0; k < 40; k++) {
    const v = g(sx, sy);
    if (!isFinite(v) || Math.abs(v) < 1e-12) break;
    const [gx, gy] = grad(sx, sy);
    const m2 = gx * gx + gy * gy;
    if (!(m2 > 1e-18)) break;
    sx -= gx * (v / m2);
    sy -= gy * (v / m2);
  }
  if (!isFinite(sx) || !isFinite(sy) || !field.inDomain(sx, sy)) return null;

  const forward = [];
  const backward = [];
  let closed = false;

  for (const dir of [1, -1]) {
    const out = dir > 0 ? forward : backward;
    let px = sx, py = sy;
    for (let i = 0; i < maxSteps; i++) {
      const [gx, gy] = grad(px, py);
      const gm = Math.hypot(gx, gy);
      if (!isFinite(gm) || gm < 1e-12) break;

      // Along the tangent — perpendicular to the constraint's gradient — then
      // pulled back onto g = 0, exactly as the level-curve trace does.
      px += dir * (-gy / gm) * step;
      py += dir * (gx / gm) * step;
      for (let k = 0; k < 2; k++) {
        const [cx, cy] = grad(px, py);
        const cm2 = cx * cx + cy * cy;
        if (!(cm2 > 1e-18)) break;
        const err = g(px, py);
        if (!isFinite(err)) break;
        px -= cx * (err / cm2);
        py -= cy * (err / cm2);
      }

      // The window's edge is the end of the walk: a frontier that leaves the
      // plot has left the problem the student was given.
      if (!field.inDomain(px, py) || !isFinite(field.height(px, py))) break;
      out.push(px, py);

      if (i > 8 && Math.hypot(px - sx, py - sy) < step * 0.75) { closed = true; break; }
    }
    if (closed) break;              // a loop needs tracing only one way round
  }

  const pts = [];
  for (let i = backward.length - 2; i >= 0; i -= 2) pts.push(backward[i], backward[i + 1]);
  pts.push(sx, sy);
  for (let i = 0; i < forward.length; i += 2) pts.push(forward[i], forward[i + 1]);
  if (pts.length < 6) return null;
  return { pts, closed };
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
    const flat = field.worldY(z) + lift;
    const arr = this.geometry.getAttribute('position').array;

    // Same treatment as the contour set: the centreline is level, the band
    // itself is draped over the ground it crosses.
    const groundY = (wx, wz) => {
      const zz = field.height(field.mathX(wx), field.mathY(wz));
      return isFinite(zz) ? field.worldY(zz) + lift : flat;
    };

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

      const o = q * 12;
      const c0x = ax - ex + sx, c0z = az - ez + sz;
      const c1x = bx + ex + sx, c1z = bz + ez + sz;
      const c2x = bx + ex - sx, c2z = bz + ez - sz;
      const c3x = ax - ex - sx, c3z = az - ez - sz;
      arr[o] = c0x; arr[o + 1] = groundY(c0x, c0z); arr[o + 2] = c0z;
      arr[o + 3] = c1x; arr[o + 4] = groundY(c1x, c1z); arr[o + 5] = c1z;
      arr[o + 6] = c2x; arr[o + 7] = groundY(c2x, c2z); arr[o + 8] = c2z;
      arr[o + 9] = c3x; arr[o + 10] = groundY(c3x, c3z); arr[o + 11] = c3z;
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
 * The tangent line to that contour, at the player's feet — projected onto the
 * surface rather than left hanging in the air.
 *
 * A level curve keeps f constant, so its tangent at p is horizontal and points
 * perpendicular to ∇f(p). Drawn as a straight bar it would leave the ground the
 * moment the hill turns, which reads as a floating stick rather than as a line
 * touching a curve. So what is drawn is the tangent direction *pushed back down
 * onto the surface*: the curve t ↦ (p + t·u, f(p + t·u)). It agrees with the
 * true tangent line to first order at p, which is precisely the claim being
 * made, and the gap that opens further out is the second-order error — visible,
 * and worth seeing. Shrink the explorer and it closes.
 */
export class TangentLineGizmo {
  constructor(field, segments = 48) {
    this.field = field;
    this.seg = segments;                        // per side of the centre
    const rows = segments * 2 + 1;
    this.rows = rows;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(rows * 2 * 3), 3));
    const idx = [];
    for (let i = 0; i < rows - 1; i++) {
      const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
      idx.push(a, c, b, b, c, d);
    }
    geom.setIndex(idx);
    this.geometry = geom;

    this.material = new THREE.MeshBasicMaterial({
      // Magenta: nothing else in the palette is near it, so the tangent reads
      // against green, tan, snow and water alike.
      color: 0xff2f9e, side: THREE.DoubleSide, toneMapped: false, fog: false,
      transparent: true, opacity: 0.95, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -12, polygonOffsetUnits: -24,
    });
    this.mesh = new THREE.Mesh(geom, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.mesh.visible = false;

    this._p = new THREE.Vector3();
    this._n = new THREE.Vector3();
    this._t = new THREE.Vector3();
    this._s = new THREE.Vector3();
  }

  /** @param lengthMetres total length, as arc length over the surface */
  update(cx, cy, lengthMetres, widthMetres) {
    const field = this.field;
    const z = field.height(cx, cy);
    const [gx, gy] = field.gradient(cx, cy);
    const gm = Math.hypot(gx, gy);
    if (!isFinite(z) || !isFinite(gm) || gm < 1e-12) { this.mesh.visible = false; return false; }

    // Tangent to the level curve in math space.
    const ux = -gy / gm, uy = gx / gm;
    const half = lengthMetres / 2;
    // Each half reaches the same distance *walked*, so a steep flank does not
    // get a stubby tangent and a flat one a sprawling bar.
    const rPos = field.arcRadius(cx, cy, ux, uy, half);
    const rNeg = field.arcRadius(cx, cy, -ux, -uy, half);

    const lift = Math.max(field.worldSize * 8e-4, widthMetres * 0.3,
      field.chordSag(cx, cy, Math.max(rPos, rNeg), this.seg, 2) * 1.3);
    const hw = widthMetres / 2;
    const arr = this.geometry.getAttribute('position').array;
    const p = this._p, nrm = this._n, tan = this._t, side = this._s;
    const seg = this.seg;
    const eps = Math.max((rPos + rNeg) * 1e-3, 1e-12);

    for (let i = 0; i < this.rows; i++) {
      const u = (i - seg) / seg;                       // −1 … +1
      const t = u >= 0 ? u * rPos : u * rNeg;
      const x = cx + ux * t, y = cy + uy * t;
      const zz = field.height(x, y);
      if (!isFinite(zz)) { this.mesh.visible = false; return false; }

      field.toWorld(x, y, zz, p);
      field.worldNormal(x, y, nrm);

      const za = field.height(cx + ux * (t - eps), cy + uy * (t - eps));
      const zb = field.height(cx + ux * (t + eps), cy + uy * (t + eps));
      if (isFinite(za) && isFinite(zb)) {
        tan.set(
          field.worldX(cx + ux * (t + eps)) - field.worldX(cx + ux * (t - eps)),
          field.worldY(zb - za),
          field.worldZ(cy + uy * (t + eps)) - field.worldZ(cy + uy * (t - eps)),
        );
      } else {
        tan.set(ux, 0, -uy);
      }
      if (tan.lengthSq() < 1e-24) tan.set(ux, 0, -uy);
      tan.normalize();
      side.crossVectors(nrm, tan).normalize().multiplyScalar(hw);

      const k = i * 2;
      arr[k * 3] = p.x + side.x + nrm.x * lift;
      arr[k * 3 + 1] = p.y + side.y + nrm.y * lift;
      arr[k * 3 + 2] = p.z + side.z + nrm.z * lift;
      arr[(k + 1) * 3] = p.x - side.x + nrm.x * lift;
      arr[(k + 1) * 3 + 1] = p.y - side.y + nrm.y * lift;
      arr[(k + 1) * 3 + 2] = p.z - side.z + nrm.z * lift;
    }

    this.geometry.getAttribute('position').needsUpdate = true;
    this.geometry.computeBoundingSphere();
    this.mesh.visible = true;
    return true;
  }

  setVisible(v) { this.mesh.visible = v; }
  dispose() { this.geometry.dispose(); this.material.dispose(); }
}

/* ------------------------------------------------------- surface ribbons */

/**
 * An arrow painted on the surface: one ribbon of quads that follows z = f(x,y)
 * from the centre out to the rim, narrow along the shaft and then flaring into
 * a flat triangular head — the arrow of a map, not a cone stuck on a stick.
 *
 * The whole thing lies in the surface, so on a hillside it bends with the
 * hillside and its length is arc length, the distance actually walked.
 */
class SurfaceArrow {
  constructor(color, segments = 20) {
    this.seg = segments;
    // Rows of two vertices each: `segments + 1` down the shaft, then the two
    // barbs, then the tip (doubled, so every row has the same two-vertex shape
    // and the strip indices stay uniform).
    this.rows = segments + 3;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.rows * 2 * 3), 3));
    const idx = [];
    for (let i = 0; i < this.rows - 1; i++) {
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

    this.group = new THREE.Group();
    this.group.add(this.ribbon);
    this.group.visible = false;
    this.geometry = geom;

    this._p = new THREE.Vector3();
    this._n = new THREE.Vector3();
    this._t = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._prev = new THREE.Vector3();
    this._next = new THREE.Vector3();
  }

  /**
   * @param r         outer radius, in math units (the arc-length rim)
   * @param rShaft    where the shaft stops and the head begins, in math units
   * @param width     shaft half-width, in world metres
   * @param headWidth half-width at the barbs, in world metres
   * @param lift      how far along the normal to float, in world metres
   */
  update(field, cx, cy, ux, uy, r, rShaft, width, headWidth, lift) {
    const pos = this.geometry.getAttribute('position');
    const arr = pos.array;
    const seg = this.seg;
    const p = this._p, nrm = this._n, tan = this._t, side = this._s;
    const prev = this._prev, next = this._next;

    // Parameter and half-width of every row, in order from the centre out.
    const ts = new Array(this.rows);
    const hw = new Array(this.rows);
    for (let i = 0; i <= seg; i++) { ts[i] = (i / seg) * rShaft; hw[i] = width; }
    ts[seg + 1] = rShaft;                 // barbs, at the same point as the
    hw[seg + 1] = headWidth;              // shaft's end: a clean square shoulder
    ts[seg + 2] = r;                      // tip
    hw[seg + 2] = width * 0.06;           // not quite zero, so it stays visible

    const eps = Math.max(r * 1e-3, 1e-12);

    for (let i = 0; i < this.rows; i++) {
      const t = ts[i];
      const x = cx + ux * t, y = cy + uy * t;
      const z = field.height(x, y);
      if (!isFinite(z)) { this.group.visible = false; return false; }

      field.toWorld(x, y, z, p);
      field.worldNormal(x, y, nrm);

      // Tangent by a central difference along the ray, which keeps the ribbon
      // from twisting where the strip has two rows at the same parameter.
      const za = field.height(cx + ux * (t - eps), cy + uy * (t - eps));
      const zb = field.height(cx + ux * (t + eps), cy + uy * (t + eps));
      if (isFinite(za) && isFinite(zb)) {
        prev.set(field.worldX(cx + ux * (t - eps)), field.worldY(za), field.worldZ(cy + uy * (t - eps)));
        next.set(field.worldX(cx + ux * (t + eps)), field.worldY(zb), field.worldZ(cy + uy * (t + eps)));
        tan.subVectors(next, prev);
      } else {
        tan.set(field.worldX(cx + ux) - field.worldX(cx), 0, field.worldZ(cy + uy) - field.worldZ(cy));
      }
      if (tan.lengthSq() < 1e-24) tan.set(ux, 0, -uy);
      tan.normalize();

      side.crossVectors(nrm, tan).normalize().multiplyScalar(hw[i]);

      const k = i * 2;
      arr[k * 3] = p.x + side.x + nrm.x * lift;
      arr[k * 3 + 1] = p.y + side.y + nrm.y * lift;
      arr[k * 3 + 2] = p.z + side.z + nrm.z * lift;
      arr[(k + 1) * 3] = p.x - side.x + nrm.x * lift;
      arr[(k + 1) * 3 + 1] = p.y - side.y + nrm.y * lift;
      arr[(k + 1) * 3 + 2] = p.z - side.z + nrm.z * lift;
    }

    pos.needsUpdate = true;
    this.geometry.computeBoundingSphere();
    this.group.visible = true;
    return true;
  }

  setVisible(v) { this.group.visible = v; }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

/**
 * The highlighted neighbourhood: a translucent disc conforming to the surface,
 * with a bright rim, plus the four arrows.
 */
export class DerivativeGizmo {
  constructor(field) {
    this.field = field;
    this.lift = 0;                  // published for whatever stands on the disc
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
   * @param opts { radiusMetres, showDisc, showX, showY, showGrad, showDir,
   *              dirAngle }
   *
   * `showDisc: false` keeps the arrows and stands the shaded patch down, for
   * when the geodesic circle is being drawn in its place. The arrows still
   * reach the same arc length, so the two rims can be compared directly — and
   * on anything curved they do not coincide.
   *
   * @returns readouts for the HUD
   */
  update(cx, cy, opts) {
    const field = this.field;
    const L = opts.radiusMetres;                       // arc length, in metres
    const width = L * 0.020;                           // shaft half-width

    // A representative math radius, only for sizing the lift and the sagitta
    // probe. Each direction gets its own exact radius below.
    const rTypical = field.arcRadius(cx, cy, 1, 0, L);

    // Clear the surface. Two things have to be cleared, not one: the flat quads
    // we draw between samples cut under a dome (the sagitta), and the detail
    // rings the terrain draws underfoot float a little above the mathematical
    // surface themselves (the clearance the caller hands us).
    const sag = field.chordSag(cx, cy, rTypical, this.rings, 8);
    const lift = Math.max(field.worldSize * 1.5e-4, L * 0.02,
      sag * 1.35, (opts.clearance || 0) * 2.6);
    this.lift = lift;

    const wantDisc = opts.showDisc !== false;
    this.disc.visible = wantDisc;
    this.rim.visible = wantDisc;
    if (wantDisc) this._updateDisc(cx, cy, L, lift);

    const h = rTypical * 1e-3;
    const fx = field.partialX(cx, cy, h);
    const fy = field.partialY(cx, cy, h);
    const gm = Math.hypot(fx, fy);

    const out = {
      fx, fy, gradMag: gm,
      gradDir: gm > 1e-12 ? Math.atan2(fy, fx) : NaN,
      avgX: NaN, avgY: NaN, avgG: NaN, dirSlope: NaN, avgDir: NaN,
      radiusMath: rTypical, lift,
    };

    this.arrowX.setVisible(false);
    this.arrowY.setVisible(false);
    this.arrowG.setVisible(false);
    this.arrowU.setVisible(false);

    // Average rates are still rise over *run*, the honest secant slope — it is
    // only the reach of the arrow that is now measured along the surface.
    const rx = field.arcRadius(cx, cy, 1, 0, L);
    const ry = field.arcRadius(cx, cy, 0, 1, L);
    out.avgX = field.averageRate(cx, cy, 1, 0, rx);
    out.avgY = field.averageRate(cx, cy, 0, 1, ry);

    if (opts.showX) this._arm(this.arrowX, cx, cy, 1, 0, L, width, lift, rx);
    if (opts.showY) this._arm(this.arrowY, cx, cy, 0, 1, L, width, lift, ry);

    if (opts.showGrad && gm > 1e-12) {
      const ux = fx / gm, uy = fy / gm;
      // Double width, as the gradient is the headline vector here.
      const rg = this._arm(this.arrowG, cx, cy, ux, uy, L, width * 2, lift * 1.3);
      out.avgG = field.averageRate(cx, cy, ux, uy, rg);
    }

    if (opts.showDir) {
      const ux = Math.cos(opts.dirAngle), uy = Math.sin(opts.dirAngle);
      out.dirSlope = fx * ux + fy * uy;
      out.dirAngle = opts.dirAngle;
      const rd = this._arm(this.arrowU, cx, cy, ux, uy, L, width * 1.4, lift * 1.55);
      out.avgDir = field.averageRate(cx, cy, ux, uy, rd);
    }

    return out;
  }

  /**
   * Lay one arrow along direction (ux, uy) so that its tip is `L` metres away
   * *measured over the surface*. Returns the math radius it reached.
   */
  _arm(arrow, cx, cy, ux, uy, L, width, lift, rKnown) {
    const field = this.field;
    const r = rKnown ?? field.arcRadius(cx, cy, ux, uy, L);
    // Draughtsman's proportions: the head is a little over twice the width of
    // the shaft and about as long again, so it reads as a barb on a long thin
    // line rather than as a dart with a stub behind it. Tied to the shaft's own
    // width, not to the arrow's length, so a 1 m arrow and a 10 m arrow look
    // like the same arrow at different sizes.
    const headWidth = width * 2.2;
    const headLen = Math.min(headWidth * 1.5, L * 0.14);
    const rShaft = field.arcRadius(cx, cy, ux, uy, L - headLen);
    arrow.update(field, cx, cy, ux, uy, r, Math.min(rShaft, r), width, headWidth, lift);
    return r;
  }

  _updateDisc(cx, cy, L, lift) {
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
      arr[k * 3] = p.x + nrm.x * lift * 0.75;
      arr[k * 3 + 1] = p.y + nrm.y * lift * 0.75;
      arr[k * 3 + 2] = p.z + nrm.z * lift * 0.75;
    };

    put(0, cx, cy);
    for (let s = 0; s < this.sectors; s++) {
      const a = (s / this.sectors) * Math.PI * 2;
      const ux = Math.cos(a), uy = Math.sin(a);
      // One arc-length radius per sector, so the rim really is the set of
      // points L metres' walk from the explorer. Over a bowl or a ridge it is
      // visibly not a circle in (x, y) — which is exactly the lesson.
      const r = field.arcRadius(cx, cy, ux, uy, L);
      for (let ri = 0; ri < this.rings; ri++) {
        const rr = ((ri + 1) / this.rings) * r;
        const k = 1 + ri * this.sectors + s;
        put(k, cx + ux * rr, cy + uy * rr);
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

  /**
   * @param radiusMetres  half-width, as arc length over the surface
   * @param lift          clearance along the normal, in world metres
   *
   * The lift is a lie of a few centimetres, told on purpose: over a bowl the
   * true tangent plane lies under the surface everywhere except at the single
   * point of tangency, and an object buried in the ground teaches nobody
   * anything. Slide the explorer scale down and the gap closes on its own.
   */
  update(cx, cy, radiusMetres, lift = 0) {
    const field = this.field;
    const r = field.arcRadius(cx, cy, 1, 0, radiusMetres * 1.6);
    const z0 = field.height(cx, cy);
    const [fx, fy] = field.gradient(cx, cy, Math.max(r, 1e-9) * 1e-3);
    if (!isFinite(z0) || !isFinite(fx) || !isFinite(fy)) { this.mesh.visible = false; return; }

    // Build the plane's basis directly in world space.
    const o = new THREE.Vector3(field.worldX(cx), field.worldY(z0), field.worldZ(cy));
    if (lift) o.addScaledVector(field.normalFromGrad(fx, fy, new THREE.Vector3()), lift);
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
