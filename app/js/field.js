/**
 * field.js — the bridge between "math space" and "world space".
 *
 * Math space is whatever the student typed: x, y over the chosen domain and
 * z = f(x,y). World space is metres in the three.js scene, where a 1.8 m tall
 * character has to look right standing on the surface.
 *
 * The mapping is a uniform scale S plus a recentring, so slopes are preserved
 * exactly: dz/dx is the same number in both spaces. (Vertical exaggeration, if
 * the user turns it up, breaks that on purpose — it is visual only, and every
 * number the HUD reports is still the true math value.)
 *
 * Axis convention: math +x -> world +X, math z (height) -> world +Y,
 * math +y -> world -Z. Seen from above with camera up = -Z, that is the
 * familiar orientation of a plot: x to the right, y up the screen.
 */

export class Field {
  constructor(options) {
    const o = options || {};
    this.fn = o.fn || ((x, y) => 0);
    this.setDomain(o.xmin ?? -1, o.xmax ?? 1, o.ymin ?? -1, o.ymax ?? 1, o.worldSize ?? 200);
    this.vex = o.vex ?? 1; // vertical exaggeration, visual only
  }

  setDomain(xmin, xmax, ymin, ymax, worldSize) {
    this.xmin = xmin; this.xmax = xmax;
    this.ymin = ymin; this.ymax = ymax;
    this.worldSize = worldSize ?? this.worldSize ?? 200;
    this.cx = (xmin + xmax) / 2;
    this.cy = (ymin + ymax) / 2;
    const span = Math.max(xmax - xmin, ymax - ymin) || 1;
    this.S = this.worldSize / span; // world metres per math unit
  }

  /** Height f(x,y). May be NaN where the function is undefined — callers must check. */
  height(x, y) {
    const z = this.fn(x, y);
    return typeof z === 'number' && isFinite(z) ? z : NaN;
  }

  inDomain(x, y) {
    return x >= this.xmin && x <= this.xmax && y >= this.ymin && y <= this.ymax;
  }

  // --- coordinate conversion -------------------------------------------

  worldX(x) { return (x - this.cx) * this.S; }
  worldZ(y) { return -(y - this.cy) * this.S; }
  worldY(z) { return z * this.S * this.vex; }

  mathX(wx) { return wx / this.S + this.cx; }
  mathY(wz) { return -wz / this.S + this.cy; }

  /** Write the world position of math point (x, y, f(x,y)) into `out` (any {x,y,z}). */
  toWorld(x, y, z, out) {
    out.x = this.worldX(x);
    out.y = this.worldY(z);
    out.z = this.worldZ(y);
    return out;
  }

  /** World position of the surface point above (x, y). */
  surfacePoint(x, y, out) {
    return this.toWorld(x, y, this.height(x, y), out);
  }

  /** A step of `metres` world-metres expressed in math units. */
  mathStep(metres) { return metres / this.S; }

  // --- calculus ---------------------------------------------------------

  /**
   * Central-difference gradient at (x, y).
   * `h` is in math units; it defaults to a domain-relative step that keeps
   * truncation and round-off error comfortably apart.
   */
  gradient(x, y, h) {
    const step = h || Math.max(this.xmax - this.xmin, this.ymax - this.ymin) * 1e-5;
    return [this.partialX(x, y, step), this.partialY(x, y, step)];
  }

  partialX(x, y, h) {
    const a = this.height(x + h, y), b = this.height(x - h, y);
    if (isFinite(a) && isFinite(b)) return (a - b) / (2 * h);
    const c = this.height(x, y);            // one-sided fallback at a domain edge
    if (isFinite(a) && isFinite(c)) return (a - c) / h;
    if (isFinite(b) && isFinite(c)) return (c - b) / h;
    return NaN;
  }

  partialY(x, y, h) {
    const a = this.height(x, y + h), b = this.height(x, y - h);
    if (isFinite(a) && isFinite(b)) return (a - b) / (2 * h);
    const c = this.height(x, y);
    if (isFinite(a) && isFinite(c)) return (a - c) / h;
    if (isFinite(b) && isFinite(c)) return (c - b) / h;
    return NaN;
  }

  /** Directional derivative along the unit vector (ux, uy) in math space. */
  directional(x, y, ux, uy, h) {
    const [fx, fy] = this.gradient(x, y, h);
    return fx * ux + fy * uy;
  }

  /**
   * Average rate of change over a finite step: [f(p + r·u) − f(p)] / r.
   * This is the secant slope the disc actually draws, as opposed to the
   * instantaneous derivative — showing both is the point of the exercise.
   */
  averageRate(x, y, ux, uy, r) {
    const z0 = this.height(x, y);
    const z1 = this.height(x + ux * r, y + uy * r);
    if (!isFinite(z0) || !isFinite(z1)) return NaN;
    return (z1 - z0) / r;
  }

  /** Unit surface normal in WORLD space (respects vertical exaggeration). */
  worldNormal(x, y, out) {
    const [fx, fy] = this.gradient(x, y);
    if (!isFinite(fx) || !isFinite(fy)) { out.set(0, 1, 0); return out; }
    // Surface (X, vex·f, −Y): normal ∝ (−vex·fx, 1, +vex·fy) in world axes.
    out.set(-fx * this.vex, 1, fy * this.vex).normalize();
    return out;
  }
}

/**
 * A regular sample of the field over the domain.
 * Held as flat typed arrays: index = j * (n+1) + i, i along x, j along y.
 */
export class FieldGrid {
  constructor(field, n) {
    this.field = field;
    this.n = n;
    const w = n + 1;
    this.w = w;
    this.z = new Float32Array(w * w);
    this.valid = new Uint8Array(w * w);
    this.zmin = Infinity;
    this.zmax = -Infinity;
    this.anyValid = false;
    this.sample();
  }

  x(i) { return this.field.xmin + (i / this.n) * (this.field.xmax - this.field.xmin); }
  y(j) { return this.field.ymin + (j / this.n) * (this.field.ymax - this.field.ymin); }

  sample() {
    const { field, n, w } = this;
    let zmin = Infinity, zmax = -Infinity, any = false;
    for (let j = 0; j <= n; j++) {
      const yy = this.y(j);
      for (let i = 0; i <= n; i++) {
        const k = j * w + i;
        const v = field.height(this.x(i), yy);
        if (isFinite(v)) {
          this.z[k] = v;
          this.valid[k] = 1;
          if (v < zmin) zmin = v;
          if (v > zmax) zmax = v;
          any = true;
        } else {
          this.z[k] = 0;
          this.valid[k] = 0;
        }
      }
    }
    if (!any) { zmin = 0; zmax = 1; }
    if (zmax - zmin < 1e-12) { zmax = zmin + 1e-6; } // guard flat functions
    this.zmin = zmin;
    this.zmax = zmax;
    this.anyValid = any;
    this.computeSlopeReference();
  }

  /**
   * A reference slope for this particular surface: the median of |∇f| over the
   * grid, from differences of samples we already have (no extra evaluations).
   *
   * Biome rules are written against this rather than against absolute numbers.
   * √(xy) has slope ≈ 0.7 almost everywhere, so a fixed "steep means > 0.55"
   * threshold would render the entire mountain as bare rock; measuring each
   * surface against itself gives every function a plausible spread of grass,
   * forest, scree and snow.
   */
  computeSlopeReference() {
    const { n, w } = this;
    const dx = (this.field.xmax - this.field.xmin) / n;
    const dy = (this.field.ymax - this.field.ymin) / n;
    const stride = Math.max(1, Math.floor(n / 64)); // cap the sample at ~4k slopes
    const samples = [];

    for (let j = 1; j < n; j += stride) {
      for (let i = 1; i < n; i += stride) {
        const k = j * w + i;
        const kl = k - 1, kr = k + 1, kd = k - w, ku = k + w;
        if (!(this.valid[k] && this.valid[kl] && this.valid[kr] && this.valid[kd] && this.valid[ku])) continue;
        const gx = (this.z[kr] - this.z[kl]) / (2 * dx);
        const gy = (this.z[ku] - this.z[kd]) / (2 * dy);
        const s = Math.hypot(gx, gy);
        if (isFinite(s)) samples.push(s);
      }
    }

    if (samples.length === 0) { this.slopeRef = 1; return; }
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length * 0.5)];
    // Keep it away from zero so a plane does not divide everything by nothing.
    this.slopeRef = Math.max(median, (this.zmax - this.zmin) * 1e-3, 1e-6);
  }

  /** Normalised height in [0,1], used for biome and hypsometric colouring. */
  norm(z) { return (z - this.zmin) / (this.zmax - this.zmin); }

  /**
   * Height of the *rendered* triangle mesh at (x, y) — not of f itself.
   *
   * The winding here has to match the triangulation in terrain.js, so that
   * anything meant to sit on the visible surface (decorations, the local patch)
   * lands on the triangles the student can actually see rather than on the
   * ideal surface hiding behind them.
   */
  meshHeight(x, y) {
    const f = this.field;
    const n = this.n, w = this.w;
    const u0 = ((x - f.xmin) / (f.xmax - f.xmin)) * n;
    const v0 = ((y - f.ymin) / (f.ymax - f.ymin)) * n;
    let i = Math.floor(u0), j = Math.floor(v0);
    // Clamp the far edge into the last cell instead of falling off it.
    if (i === n) i = n - 1;
    if (j === n) j = n - 1;
    if (i < 0 || j < 0 || i >= n || j >= n) return NaN;
    const u = u0 - i, v = v0 - j;

    const ka = j * w + i, kb = j * w + i + 1, kc = (j + 1) * w + i, kd = (j + 1) * w + i + 1;
    if (!(this.valid[ka] && this.valid[kb] && this.valid[kc] && this.valid[kd])) return NaN;
    const za = this.z[ka], zb = this.z[kb], zc = this.z[kc], zd = this.z[kd];

    return (u + v <= 1)
      ? za + u * (zb - za) + v * (zc - za)
      : zd + (1 - u) * (zc - zd) + (1 - v) * (zb - zd);
  }
}
