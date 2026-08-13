/**
 * walker.js — standing on, and walking over, a surface that is not a graph.
 *
 * The rest of the program walks a heightfield, where "where am I" is a point of
 * the plane and "which way is up" is always the same direction. Neither holds
 * on a torus, and both fail differently:
 *
 *   parametric  r(u,v)      — position is a point of the parameter rectangle,
 *       and moving at a constant *world* speed means moving in (u,v) at a speed
 *       corrected by the first fundamental form. The normal is r_u × r_v.
 *
 *   implicit    F(x,y,z)=0  — there is no global chart at all, so position is
 *       an actual point of space and a step is taken along the tangent plane
 *       and then pulled back onto the surface by Newton's method along ∇F.
 *       The normal is ∇F, which exists everywhere ∇F ≠ 0.
 *
 * Walking is geodesic
 * -------------------
 * Going forward means following the geodesic through where you are with your
 * velocity as its initial condition — the straightest path the surface allows,
 * which on a sphere is a great circle and on a plane is a straight line. It is
 * what "walking without turning" has to mean once there is curvature, and it is
 * the only definition under which the answer does not depend on how somebody
 * happened to parameterise the surface.
 *
 * It is integrated as the discrete straightest path: step along the current
 * tangent direction, come back to the surface, and carry the direction over by
 * the rotation that takes the old normal to the new one about their common
 * perpendicular. That rotation is the Levi-Civita parallel transport for a small
 * step — it is the one that introduces no spin about the normal — so the
 * heading is genuinely parallel-transported and the path converges to the true
 * geodesic as the step shrinks. No Christoffel symbols appear, and the same six
 * lines serve both kinds of surface.
 *
 * Because the frame {v, n × v} is parallel along a geodesic, a heading held at
 * a fixed angle to the velocity is transported for free: the angle is a
 * constant of the motion. That is what lets you strafe along one geodesic while
 * looking down another.
 *
 * Orientation. A surface cut out by a single equation F = 0 always has a
 * consistent side, because ∇F picks one; flipping the sign walks you on the
 * inside instead. A parametric patch may not — carry the frame once around a
 * Möbius strip and it comes back reversed. That is not a bug to be papered
 * over, it is the definition of non-orientable, and the walker lets it happen.
 */

import * as THREE from '../vendor/three.module.js';

/**
 * The rotation that stands a model up along `up` and points it along `face`.
 *
 * The character is a rigid body. Walking it over a torus may translate it and
 * rotate it and nothing else — no shear, and in particular no reflection, which
 * is the trap here. A Matrix4 built from three orthonormal columns is a
 * rotation only when the third is the cross product of the first two, and a
 * model's own axes are (right, up, back): with `up` second and `−face` third,
 * the first column must be face × up. Built as up × face instead, the matrix
 * has determinant −1, and Three's quaternion extraction — which assumes a
 * rotation — returns something unrelated to the stance and not even unit, so the
 * character is genuinely distorted and the distortion changes as it moves.
 *
 * Both arguments must be unit and orthogonal; the caller orthogonalises,
 * because it is the caller that knows what to fall back on when they are not.
 */
export function standBasis(up, face, out) {
  const right = new THREE.Vector3().crossVectors(face, up).normalize();
  return (out || new THREE.Matrix4()).makeBasis(right, up, face.clone().negate());
}

/** Central difference of a vector-valued function of one parameter. */
function diff(fn, t, h, out) {
  const a = fn(t - h), b = fn(t + h);
  out.set((b[0] - a[0]) / (2 * h), (b[1] - a[1]) / (2 * h), (b[2] - a[2]) / (2 * h));
  return out;
}

/**
 * Carry a tangent vector from one point of the surface to a nearby one.
 *
 * The transport that adds no rotation about the normal is the rotation that
 * takes the old normal onto the new one about their common perpendicular, and
 * `setFromUnitVectors` is exactly that — including the antipodal case, where it
 * picks an arbitrary perpendicular axis rather than dividing by zero. The final
 * re-orthogonalisation only removes accumulated rounding.
 */
const _tq = new THREE.Quaternion();
function carry(w, n, n1, out) {
  _tq.setFromUnitVectors(n, n1);
  out.copy(w).applyQuaternion(_tq);
  out.addScaledVector(n1, -out.dot(n1));
  const len = out.length();
  return len > 1e-12 ? out.divideScalar(len) : out.set(0, 0, 0);
}

/* ------------------------------------------------------------------ base */

/**
 * Everything that does not depend on how the surface is described.
 *
 * A subclass owes four things: where it is in the world, the unit normal there,
 * a tangent direction to start from, and a retraction — take a world-space step
 * along the tangent plane and land back on the surface.
 */
class SurfaceWalker {
  constructor() {
    this.sign = 1;                        // +1 outside, −1 inside
    this.dir = new THREE.Vector3();       // unit world tangent: where the eyes point
    this.moveAngle = 0;                   // the body, relative to the eyes
    this._n = new THREE.Vector3();
    this._n1 = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this._p = new THREE.Vector3();
  }

  /** Make the heading a unit tangent, from a seed if it has gone stale. */
  ensureDir() {
    const n = this.normal(this._n);
    this.dir.addScaledVector(n, -this.dir.dot(n));
    if (this.dir.lengthSq() < 1e-16) {
      this.dir.copy(this.tangentSeed(this._w));
      this.dir.addScaledVector(n, -this.dir.dot(n));
      if (this.dir.lengthSq() < 1e-16) {
        // Every seed is parallel to the normal, which takes a pole and bad luck.
        this.dir.set(n.z, n.x, n.y).addScaledVector(n, -this.dir.dot(n));
      }
    }
    this.dir.normalize();
    return this.dir;
  }

  /** { n, fwd, side } — up, the way the eyes point, and the right hand. */
  frame() {
    const n = this.normal(new THREE.Vector3());
    const fwd = this.ensureDir().clone();
    return { n, fwd, side: new THREE.Vector3().crossVectors(n, fwd).normalize() };
  }

  /** Which way the body is pointed: the direction of the last step taken. */
  facing(fr) {
    const f = fr || this.frame();
    const c = Math.cos(this.moveAngle), s = Math.sin(this.moveAngle);
    return new THREE.Vector3().addScaledVector(f.fwd, c).addScaledVector(f.side, s);
  }

  /** Swing the heading within the tangent plane. */
  turn(radians) {
    const n = this.normal(this._n);
    this.ensureDir().applyAxisAngle(n, radians);
    this.dir.addScaledVector(n, -this.dir.dot(n)).normalize();
  }

  flip() {
    this.sign = -this.sign;
    // The tangent plane has not moved, so the heading is still a heading; but
    // "right" has swapped sides, and with it which way a turn goes.
    this.moveAngle = -this.moveAngle;
  }

  /**
   * How long a single integration step should be, in world units.
   *
   * Short enough that the retraction's error is invisible, long enough that a
   * stride is not a hundred surface evaluations. A fortieth of the surface's
   * own size is both.
   */
  stepLength() { return this.scaleHint() / 60; }

  /**
   * Follow the geodesic through the current point with initial velocity given
   * by the forward and sideways components of a heading, for `dist` of arc
   * length. The heading is parallel-transported along the way.
   */
  move(dist, fwdAmt, sideAmt) {
    if (!(dist > 0)) return;
    const fr = this.frame();
    const v = this._v.set(0, 0, 0)
      .addScaledVector(fr.fwd, fwdAmt)
      .addScaledVector(fr.side, sideAmt);
    if (v.lengthSq() < 1e-16) return;
    v.normalize();

    if (Math.abs(fwdAmt) + Math.abs(sideAmt) > 1e-9) {
      this.moveAngle = Math.atan2(sideAmt, fwdAmt);
    }

    // The heading's angle to the velocity is constant along a geodesic, so it
    // is enough to record it here and rebuild the heading at the far end.
    const ang = Math.atan2(fr.fwd.dot(new THREE.Vector3().crossVectors(fr.n, v)),
      fr.fwd.dot(v));

    const end = this.flow(v, dist);
    if (!end) return;
    const side1 = new THREE.Vector3().crossVectors(end.n, end.v);
    this.dir.set(0, 0, 0)
      .addScaledVector(end.v, Math.cos(ang))
      .addScaledVector(side1, Math.sin(ang))
      .normalize();
  }

  /**
   * Integrate the geodesic, moving the walker as it goes.
   *
   * @returns { n, v } the normal and the transported velocity at the far end,
   *          or null if the surface ran out underneath.
   */
  flow(v0, dist, onSample) {
    if (!(dist > 0)) return null;
    const h0 = this.stepLength();
    const p0 = new THREE.Vector3(), p1 = new THREE.Vector3();
    let nrm = this.normal(new THREE.Vector3());

    // The initial velocity has to be tangent *here*. A caller who hands over a
    // direction measured somewhere else — which is easy to do when tracing a
    // family of geodesics — would otherwise have its first step leave the
    // surface and be dragged back by the retraction, from a long way off.
    const v = new THREE.Vector3().copy(v0);
    v.addScaledVector(nrm, -v.dot(nrm));
    if (v.lengthSq() < 1e-16) return null;
    v.normalize();
    let gone = 0;
    let guard = Math.ceil(dist / h0) + 8;

    while (gone < dist && guard-- > 0) {
      const h = Math.min(h0, dist - gone);
      this.position(p0);
      if (!this.retract(v, h)) return null;
      this.position(p1);
      const n1 = this.normal(new THREE.Vector3());

      // What was actually walked, measured rather than assumed. A step of h
      // along the tangent plane lands on a chord, and the arc over that chord
      // is longer by a factor that the turn of the normal gives exactly:
      // arc = chord · (φ/2)/sin(φ/2). Without this, `dist` would mean "tangent
      // length" and the explorer would quietly travel a little further than the
      // number said — by a fraction that grows with the curvature, which is
      // precisely where it would be noticed.
      const chord = p0.distanceTo(p1);
      const cosine = Math.max(-1, Math.min(1, nrm.dot(n1)));
      const phi = Math.acos(cosine);
      gone += phi > 1e-7 ? (chord * (phi / 2)) / Math.sin(phi / 2) : chord;

      if (!carry(v, nrm, n1, v).lengthSq()) return null;
      nrm = n1;
      if (onSample) onSample(p1.clone(), nrm, v);
    }
    return { n: nrm, v };
  }

  /**
   * Trace a geodesic from where the walker is standing without disturbing it —
   * the walker is put back exactly where it was found.
   *
   * @returns { p: [x,y,z,...], n: [x,y,z,...] } in world space
   */
  geodesic(dir0, length, onSample) {
    const saved = this.snapshot();
    const p = [], nr = [];
    const push = (q, nn) => { p.push(q.x, q.y, q.z); nr.push(nn.x, nn.y, nn.z); };
    push(this.position(new THREE.Vector3()), this.normal(new THREE.Vector3()));
    this.flow(dir0, length, (q, nn, vv) => { push(q, nn); if (onSample) onSample(q, nn, vv); });
    this.restore(saved);
    return { p, n: nr };
  }
}

/* --------------------------------------------------------- parametric */

export class ParametricWalker extends SurfaceWalker {
  /**
   * @param exprs  { X, Y, Z } as compiled (u, v) closures, in math space
   * @param opts   { umin, umax, vmin, vmax, scale, sx, sy, sz, wrapU, wrapV }
   */
  constructor(exprs, opts) {
    super();
    this.e = exprs;
    this.o = opts;
    this.u = (opts.umin + opts.umax) / 2;
    this.v = (opts.vmin + opts.vmax) / 2;
    this.h = Math.min(opts.umax - opts.umin, opts.vmax - opts.vmin) * 1e-4;

    this._ru = new THREE.Vector3();
    this._rv = new THREE.Vector3();
    this._nn = new THREE.Vector3();
    this._probe0 = new THREE.Vector3();
    this._probe1 = new THREE.Vector3();
    this._resid = new THREE.Vector3();
    this._duv = [0, 0];
    this.ensureDir();
  }

  scaleHint() { return (this.o.scale || 1) * 2; }

  snapshot() { return { u: this.u, v: this.v, dir: this.dir.clone() }; }

  restore(s) { this.u = s.u; this.v = s.v; this.dir.copy(s.dir); }

  /** World position of r(u, v). */
  at(u, v, out) {
    const o = this.o;
    out.set(
      this.e.X(u, v) * o.scale * o.sx,
      this.e.Z(u, v) * o.scale * o.sz,     // math z is world up
      -this.e.Y(u, v) * o.scale * o.sy,
    );
    return out;
  }

  _tuple(u, v) {
    const p = this.at(u, v, new THREE.Vector3());
    return [p.x, p.y, p.z];
  }

  /** The two parameter derivatives at the current point, in world space. */
  basis() {
    const h = this.h;
    diff((t) => this._tuple(t, this.v), this.u, h, this._ru);
    diff((t) => this._tuple(this.u, t), this.v, h, this._rv);
    this._nn.crossVectors(this._ru, this._rv);
    if (this._nn.lengthSq() < 1e-20) {
      // A pole, where the two derivatives are parallel and the cross product
      // dies. The position vector is the best available stand-in.
      this._nn.copy(this.position(new THREE.Vector3())).normalize();
    } else {
      this._nn.normalize();
    }
    this._nn.multiplyScalar(this.sign);
    return { ru: this._ru, rv: this._rv, n: this._nn };
  }

  position(out) { return this.at(this.u, this.v, out || this._p); }

  normal(out) {
    const { n } = this.basis();
    return (out || new THREE.Vector3()).copy(n);
  }

  tangentSeed(out) {
    const { ru } = this.basis();
    return (out || new THREE.Vector3()).copy(ru);
  }

  /**
   * Take a world-space step of `h` along `v` and land back on the surface.
   *
   * The metric does the work. A desired world displacement w has to be written
   * as w ≈ r_u·du + r_v·dv, and the least-squares solution of that is exactly
   * the first fundamental form inverted:
   *
   *     [E F; F G] (du, dv)ᵀ = (r_u·w, r_v·w)ᵀ,   E = r_u·r_u, F = r_u·r_v, G = r_v·r_v
   *
   * Dividing by the two lengths separately would be the same thing only where
   * the parameter lines meet at right angles, which on a helicoid or a Möbius
   * strip they do not — and there the shortcut makes walking drift sideways.
   */
  retract(v, h) {
    const { ru, rv } = this.basis();
    const E = ru.dot(ru), F = ru.dot(rv), G = rv.dot(rv);
    const det = E * G - F * F;
    if (!(Math.abs(det) > 1e-18)) return false;    // degenerate patch, e.g. a pole

    const solve = (w, out) => {
      const a = ru.dot(w), b = rv.dot(w);
      out[0] = (G * a - F * b) / det;
      out[1] = (E * b - F * a) / det;
      return out;
    };

    const target = this._w.copy(v).multiplyScalar(h);
    const p0 = this.at(this.u, this.v, this._probe0);
    const step = solve(target, this._duv);
    let du = step[0], dv = step[1];

    // Correct twice, because the solve is linear and the surface is not.
    //
    // r(u+du, v+dv) − r(u,v) equals r_u·du + r_v·dv only to first order; the
    // second-order term is a real displacement, and on a sphere in polar
    // coordinates it points sideways. Left uncorrected it accumulates, and a
    // walk that should trace one great circle spirals off it by several per
    // cent — the path is still on the surface, and still not a geodesic.
    // Feeding the shortfall back through the same solve removes it.
    for (let i = 0; i < 2; i++) {
      const probe = this.at(this.u + du, this.v + dv, this._probe1);
      if (!isFinite(probe.x) || !isFinite(probe.y) || !isFinite(probe.z)) break;
      const resid = this._resid.copy(target).sub(probe).add(p0);
      const fix = solve(resid, this._duv);
      if (!isFinite(fix[0]) || !isFinite(fix[1])) break;
      du += fix[0]; dv += fix[1];
    }
    if (!isFinite(du) || !isFinite(dv)) return false;

    const o = this.o;
    this.u = this._clampOrWrap(this.u + du, o.umin, o.umax, o.wrapU);
    this.v = this._clampOrWrap(this.v + dv, o.vmin, o.vmax, o.wrapV);
    return true;
  }

  /**
   * Closed parameter directions wrap; open ones stop at the edge.
   *
   * A torus is periodic in both, a sphere in longitude only, a Möbius strip in
   * its long direction — and walking off the edge of a strip should stop you,
   * not teleport you to the far side.
   */
  _clampOrWrap(t, lo, hi, wrap) {
    if (!wrap) return Math.max(lo, Math.min(hi, t));
    const span = hi - lo;
    return lo + ((((t - lo) % span) + span) % span);
  }

  /** Put the walker at a parameter pair, e.g. from a click on the mesh. */
  placeAtUV(u, v) {
    this.u = Math.max(this.o.umin, Math.min(this.o.umax, u));
    this.v = Math.max(this.o.vmin, Math.min(this.o.vmax, v));
    this.ensureDir();
  }
}

/* ----------------------------------------------------------- implicit */

export class ImplicitWalker extends SurfaceWalker {
  /**
   * @param F     compiled (x, y, z) closure; the surface is F = 0
   * @param opts  { scale, sx, sy, sz, bounds: {xmin..zmax} }
   */
  constructor(F, opts) {
    super();
    this.F = F;
    this.o = opts;
    // Math-space position. Kept in math space, not world, so the axis dials can
    // be changed without the walker falling off the surface.
    this.p = new THREE.Vector3(0, 0, 0);
    const b = opts.bounds;
    this.h = Math.max(b.xmax - b.xmin, b.ymax - b.ymin, b.zmax - b.zmin) * 1e-5;

    this._g = new THREE.Vector3();
    this.ensureDir();
  }

  scaleHint() {
    const b = this.o.bounds;
    return Math.max(b.xmax - b.xmin, b.ymax - b.ymin, b.zmax - b.zmin) * (this.o.scale || 1);
  }

  snapshot() { return { p: this.p.clone(), dir: this.dir.clone() }; }

  restore(s) { this.p.copy(s.p); this.dir.copy(s.dir); }

  /** ∇F at a math-space point. */
  grad(p, out) {
    const h = this.h, F = this.F;
    out.set(
      (F(p.x + h, p.y, p.z) - F(p.x - h, p.y, p.z)) / (2 * h),
      (F(p.x, p.y + h, p.z) - F(p.x, p.y - h, p.z)) / (2 * h),
      (F(p.x, p.y, p.z + h) - F(p.x, p.y, p.z - h)) / (2 * h),
    );
    return out;
  }

  /**
   * Newton's method back onto F = 0, along the gradient.
   *
   * One step moves by −F/‖∇F‖² · ∇F, which is the exact correction for a plane
   * and converges quadratically for anything smooth. Three steps is ample at
   * the step sizes a walker takes; more would be spent on digits nobody sees.
   */
  project(p, steps = 3) {
    for (let i = 0; i < steps; i++) {
      const f = this.F(p.x, p.y, p.z);
      if (!isFinite(f)) return false;
      const g = this.grad(p, this._g);
      const g2 = g.lengthSq();
      if (!(g2 > 1e-18)) return false;
      p.addScaledVector(g, -f / g2);
      if (Math.abs(f) < 1e-12) break;
    }
    return isFinite(p.x) && isFinite(p.y) && isFinite(p.z);
  }

  /** World position of the current point. */
  position(out) {
    const o = this.o;
    return (out || this._p).set(
      this.p.x * o.scale * o.sx,
      this.p.z * o.scale * o.sz,
      -this.p.y * o.scale * o.sy,
    );
  }

  /** Unit world normal, pointing to the chosen side. */
  normal(out) {
    const o = this.o;
    const g = this.grad(this.p, this._g);
    const v = (out || new THREE.Vector3()).set(
      g.x / (o.sx || 1), g.z / (o.sz || 1), -g.y / (o.sy || 1),
    );
    if (v.lengthSq() < 1e-20) v.set(0, 1, 0);
    return v.normalize().multiplyScalar(this.sign);
  }

  tangentSeed(out) {
    const n = this.normal(this._g.clone());
    const seed = Math.abs(n.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    return (out || new THREE.Vector3()).crossVectors(seed, n);
  }

  /** Step `h` along the tangent plane in world units, then re-project. */
  retract(v, h) {
    const o = this.o;
    const step = this._w.copy(v).multiplyScalar(h / (o.scale || 1));

    // World displacement back into math space, undoing the per-axis stretch.
    const trial = this.p.clone();
    trial.x += step.x / (o.sx || 1);
    trial.y += -step.z / (o.sy || 1);
    trial.z += step.y / (o.sz || 1);

    if (!this.project(trial)) return false;
    const b = this.o.bounds;
    if (trial.x < b.xmin || trial.x > b.xmax
      || trial.y < b.ymin || trial.y > b.ymax
      || trial.z < b.zmin || trial.z > b.zmax) return false;
    this.p.copy(trial);
    return true;
  }

  /** Land on the surface at (or near) a world-space point from a click. */
  placeAtWorld(w) {
    const o = this.o;
    const p = new THREE.Vector3(
      w.x / (o.scale * o.sx),
      -w.z / (o.scale * o.sy),
      w.y / (o.scale * o.sz),
    );
    if (this.project(p, 6)) { this.p.copy(p); this.ensureDir(); }
  }
}
