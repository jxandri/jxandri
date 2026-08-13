/**
 * walker.js — standing on a surface that is not the graph of a function.
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
 * Both expose the same three things a camera and a character need: where the
 * feet are, which way is up, and a heading. "Up" is the surface normal, which
 * is what makes walking on a sphere feel like walking on a planet rather than
 * like sliding around a ball.
 *
 * Orientation. A surface cut out by a single equation F = 0 always has a
 * consistent side, because ∇F picks one; flipping the sign walks you on the
 * inside instead. A parametric patch may not — carry the frame once around a
 * Möbius strip and it comes back reversed. That is not a bug to be papered
 * over, it is the definition of non-orientable, and the walker lets it happen.
 */

import * as THREE from '../vendor/three.module.js';

/**
 * Which way the body is turned, given a frame and the last step taken.
 *
 * Heading and facing are not the same thing. The heading is where you are
 * looking — it is what the mouse turns and what the first-person camera points
 * along. Facing is which way the body is pointed, and a body points the way it
 * last moved: strafe left and you go left, sideways, still looking ahead.
 *
 * The last step is remembered as an *angle within the tangent frame* rather
 * than as a direction in space, which means it needs no parallel transport. Walk
 * a lap of a sphere and the frame carries the angle round with it for free; the
 * alternative — storing a world vector and re-projecting it every frame — drifts
 * exactly where the surface curves most, which is where it matters.
 */
function facingFrom(frame, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return new THREE.Vector3()
    .addScaledVector(frame.fwd, c)
    .addScaledVector(frame.side, s);
}

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
 * rotation — returns something unrelated to the stance and jumps about as the
 * walker moves. That reads on screen as a character being smeared onto the
 * surface rather than standing on it.
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

/* --------------------------------------------------------- parametric */

export class ParametricWalker {
  /**
   * @param exprs  { X, Y, Z } as compiled (u, v) closures, in math space
   * @param opts   { umin, umax, vmin, vmax, scale, sx, sy, sz, wrapU, wrapV }
   */
  constructor(exprs, opts) {
    this.e = exprs;
    this.o = opts;
    this.u = (opts.umin + opts.umax) / 2;
    this.v = (opts.vmin + opts.vmax) / 2;
    this.sign = 1;              // +1 outside, −1 inside
    this.heading = 0;           // radians in the tangent plane
    this.moveAngle = 0;         // where the last step went, relative to it
    this.h = Math.min(opts.umax - opts.umin, opts.vmax - opts.vmin) * 1e-4;

    this._p = new THREE.Vector3();
    this._ru = new THREE.Vector3();
    this._rv = new THREE.Vector3();
    this._n = new THREE.Vector3();
  }

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
    this._n.crossVectors(this._ru, this._rv);
    if (this._n.lengthSq() < 1e-20) {
      // A pole, where the two derivatives are parallel and the cross product
      // dies. The position vector is the best available stand-in.
      this._n.copy(this.position()).normalize();
    } else {
      this._n.normalize();
    }
    this._n.multiplyScalar(this.sign);
    return { ru: this._ru, rv: this._rv, n: this._n };
  }

  position(out) { return this.at(this.u, this.v, out || this._p); }

  normal(out) {
    const { n } = this.basis();
    return (out || new THREE.Vector3()).copy(n);
  }

  /**
   * An orthonormal frame with the heading applied — the same shape the implicit
   * walker returns, so the camera and the character do not have to know which
   * kind of surface they are on.
   *
   * Gram–Schmidt rather than raw r_u and r_v: the parameter lines of a torus or
   * a helicoid are not orthogonal, and a character built on a skewed frame
   * leans.
   */
  frame() {
    const { ru, rv, n } = this.basis();
    const t = ru.clone();
    if (t.lengthSq() < 1e-20) t.set(1, 0, 0);
    t.normalize().addScaledVector(n, -t.dot(n)).normalize();
    const b = new THREE.Vector3().crossVectors(n, t).normalize();
    // Keep the pair right-handed against r_v, so "forward" does not silently
    // reverse when the patch is parameterised the other way round.
    if (b.dot(rv) < 0) b.negate();

    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    return {
      n: n.clone(),
      fwd: new THREE.Vector3().addScaledVector(t, c).addScaledVector(b, s),
      side: new THREE.Vector3().addScaledVector(t, -s).addScaledVector(b, c),
    };
  }

  /**
   * Move `dist` world metres along the surface, in the direction given by the
   * forward and sideways components of a unit heading vector.
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
  move(dist, fwdAmt, sideAmt) {
    const { ru, rv } = this.basis();
    const { fwd, side } = this.frame();
    if (Math.abs(fwdAmt) + Math.abs(sideAmt) > 1e-9) {
      this.moveAngle = Math.atan2(sideAmt, fwdAmt);
    }

    const w = new THREE.Vector3()
      .addScaledVector(fwd, fwdAmt)
      .addScaledVector(side, sideAmt);
    if (w.lengthSq() < 1e-20) return;
    w.normalize().multiplyScalar(dist);

    const E = ru.dot(ru), F = ru.dot(rv), G = rv.dot(rv);
    const det = E * G - F * F;
    if (!(Math.abs(det) > 1e-18)) return;      // degenerate patch, e.g. a pole
    const a = ru.dot(w), b = rv.dot(w);
    const du = (G * a - F * b) / det;
    const dv = (E * b - F * a) / det;

    const o = this.o;
    this.u = this._clampOrWrap(this.u + du, o.umin, o.umax, o.wrapU);
    this.v = this._clampOrWrap(this.v + dv, o.vmin, o.vmax, o.wrapV);
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

  turn(radians) { this.heading += radians; }

  /** Which way the body is pointed: the direction of the last step taken. */
  facing(frame) { return facingFrom(frame || this.frame(), this.moveAngle); }

  flip() { this.sign = -this.sign; }

  /** Put the walker at a parameter pair, e.g. from a click on the mesh. */
  placeAtUV(u, v) {
    this.u = Math.max(this.o.umin, Math.min(this.o.umax, u));
    this.v = Math.max(this.o.vmin, Math.min(this.o.vmax, v));
  }
}

/* ----------------------------------------------------------- implicit */

export class ImplicitWalker {
  /**
   * @param F     compiled (x, y, z) closure; the surface is F = 0
   * @param opts  { scale, sx, sy, sz, bounds: {xmin..zmax} }
   */
  constructor(F, opts) {
    this.F = F;
    this.o = opts;
    this.sign = 1;
    this.heading = 0;
    this.moveAngle = 0;         // where the last step went, relative to it
    // Math-space position. Kept in math space, not world, so the axis dials can
    // be changed without the walker falling off the surface.
    this.p = new THREE.Vector3(0, 0, 0);
    const b = opts.bounds;
    this.h = Math.max(b.xmax - b.xmin, b.ymax - b.ymin, b.zmax - b.zmin) * 1e-5;

    this._g = new THREE.Vector3();
    this._t = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._w = new THREE.Vector3();
  }

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
    return (out || this._w).set(
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

  /** An orthonormal tangent frame, with the heading applied. */
  frame() {
    const n = this.normal(new THREE.Vector3());
    // Any vector not parallel to n gives a starting tangent; world up unless
    // we happen to be standing at a pole of it.
    const seed = Math.abs(n.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const t = this._t.crossVectors(seed, n).normalize();
    const b = this._b.crossVectors(n, t).normalize();
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    return {
      n,
      fwd: new THREE.Vector3().addScaledVector(t, c).addScaledVector(b, s),
      side: new THREE.Vector3().addScaledVector(t, -s).addScaledVector(b, c),
    };
  }

  /** Step `dist` world metres along the tangent plane, then re-project. */
  move(dist, fwdAmt, sideAmt) {
    const o = this.o;
    const { fwd, side } = this.frame();
    if (Math.abs(fwdAmt) + Math.abs(sideAmt) > 1e-9) {
      this.moveAngle = Math.atan2(sideAmt, fwdAmt);
    }
    const step = new THREE.Vector3()
      .addScaledVector(fwd, fwdAmt)
      .addScaledVector(side, sideAmt);
    if (step.lengthSq() < 1e-20) return;
    step.normalize().multiplyScalar(dist / (o.scale || 1));

    // World displacement back into math space, undoing the per-axis stretch.
    const trial = this.p.clone();
    trial.x += step.x / (o.sx || 1);
    trial.y += -step.z / (o.sy || 1);
    trial.z += step.y / (o.sz || 1);

    if (!this.project(trial)) return;
    const b = this.o.bounds;
    if (trial.x < b.xmin || trial.x > b.xmax
      || trial.y < b.ymin || trial.y > b.ymax
      || trial.z < b.zmin || trial.z > b.zmax) return;
    this.p.copy(trial);
  }

  turn(radians) { this.heading += radians; }

  /** Which way the body is pointed: the direction of the last step taken. */
  facing(frame) { return facingFrom(frame || this.frame(), this.moveAngle); }

  flip() { this.sign = -this.sign; }

  /** Land on the surface at (or near) a world-space point from a click. */
  placeAtWorld(w) {
    const o = this.o;
    const p = new THREE.Vector3(
      w.x / (o.scale * o.sx),
      -w.z / (o.scale * o.sy),
      w.y / (o.scale * o.sz),
    );
    if (this.project(p, 6)) this.p.copy(p);
  }
}
