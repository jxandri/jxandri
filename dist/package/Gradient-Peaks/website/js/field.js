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
    // Independent scale per axis. All three at 1 is isotropic Cartesian
    // space, where the unit sphere really is round; changing them stretches
    // the picture without touching a single reported number.
    this.sx = o.sx ?? 1;
    this.sy = o.sy ?? 1;
    this.sz = o.sz ?? 1;
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

  worldX(x) { return (x - this.cx) * this.S * this.sx; }
  worldZ(y) { return -(y - this.cy) * this.S * this.sy; }
  worldY(z) { return z * this.S * this.sz; }

  mathX(wx) { return wx / (this.S * this.sx) + this.cx; }
  mathY(wz) { return -wz / (this.S * this.sy) + this.cy; }

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

  /**
   * The math-space radius whose *arc length along the surface* is `metres`.
   *
   * Everywhere else a "2 m neighbourhood" meant two metres measured on the flat
   * (x, y) floor, which is not what a walker experiences: on a slope of 1 you
   * cover 2 m of ground in √2 ≈ 1.41 m of floor. Measuring along the surface is
   * the honest thing — it is the length that the first fundamental form
   *
   *     g = (1 + f_x²) dx² + 2 f_x f_y dx dy + (1 + f_y²) dy²
   *
   * assigns to the curve t ↦ (x + t·u, y + t·v), which is exactly what this
   * integrates: ‖γ'(t)‖ = √(u² + v² + (∇f · u)²) in world units, sampled rather
   * than written out, so that anisotropic axis scales come along for free.
   *
   * The rim is therefore the set of points reached by walking `metres` in a
   * fixed compass direction — not the geodesic circle of that radius, which
   * would need the straight rays replaced by solutions of the geodesic
   * equation. The two agree to second order in the radius, and at these radii
   * the difference is far below a pixel; the compass reading is also the one a
   * walker can actually verify.
   *
   * Integrated by marching, because the integrand needs f anyway and marching
   * doubles as the domain-edge check: where f stops being defined, so does the
   * neighbourhood, and the returned radius is however far we got.
   */
  arcRadius(cx, cy, ux, uy, metres) {
    const flat = metres / this.S;            // what it would be on level ground
    if (!(flat > 0)) return 0;

    const step = flat / 8;
    const maxSteps = 8 * 24;                 // give up past 24× the flat radius
    const z0 = this.height(cx, cy);
    if (!isFinite(z0)) return flat;

    let t = 0, s = 0;
    let px = this.worldX(cx), py = this.worldY(z0), pz = this.worldZ(cy);

    for (let i = 0; i < maxSteps; i++) {
      const t2 = t + step;
      const x2 = cx + ux * t2, y2 = cy + uy * t2;
      const z2 = this.height(x2, y2);
      if (!isFinite(z2)) return t;           // ran off the edge of the domain
      const qx = this.worldX(x2), qy = this.worldY(z2), qz = this.worldZ(y2);
      const ds = Math.hypot(qx - px, qy - py, qz - pz);
      if (!(ds > 0)) return t2;              // degenerate: nothing to integrate
      if (s + ds >= metres) return t + step * ((metres - s) / ds);
      s += ds; t = t2; px = qx; py = qy; pz = qz;
    }
    return t;
  }

  /**
   * How far the surface bulges above the straight chords drawn between `nSeg`
   * samples out to radius `r` — the sagitta, in world metres.
   *
   * Anything drawn *on* the surface is really a chain of flat quads through
   * points of it. Over a dome those chords pass underneath the surface between
   * their endpoints and the whole overlay disappears into the ground; over a
   * bowl they never do. Lifting everything by this much clears the worst case
   * without floating conspicuously in the flat case, where it is zero.
   */
  chordSag(cx, cy, r, nSeg, directions = 8) {
    if (!(r > 0) || nSeg < 1) return 0;
    let worst = 0;
    for (let d = 0; d < directions; d++) {
      const a = (d / directions) * Math.PI * 2;
      const ux = Math.cos(a), uy = Math.sin(a);
      for (let i = 0; i < nSeg; i++) {
        const t0 = (i / nSeg) * r, t1 = ((i + 1) / nSeg) * r;
        const z0 = this.height(cx + ux * t0, cy + uy * t0);
        const z1 = this.height(cx + ux * t1, cy + uy * t1);
        const zm = this.height(cx + ux * (t0 + t1) / 2, cy + uy * (t0 + t1) / 2);
        if (!isFinite(z0) || !isFinite(z1) || !isFinite(zm)) continue;
        const sag = this.worldY(zm - (z0 + z1) / 2);
        if (sag > worst) worst = sag;
      }
    }
    return worst;
  }

  /** Unit surface normal in WORLD space (respects vertical exaggeration). */
  worldNormal(x, y, out) {
    const [fx, fy] = this.gradient(x, y);
    return this.normalFromGrad(fx, fy, out);
  }

  /**
   * Same, but from a gradient you already have.
   * Callers that need both the normal and the slope should compute the gradient
   * once and use this — evaluating f four extra times per vertex is the single
   * biggest cost in building a high-resolution mesh.
   */
  normalFromGrad(fx, fy, out) {
    if (!isFinite(fx) || !isFinite(fy)) { out.set(0, 1, 0); return out; }
    // Surface X = S·sx·x, Y = S·sz·f, Z = −S·sy·y, so ∂Y/∂X = sz·fx/sx and
    // ∂Y/∂Z = −sz·fy/sy; the normal follows.
    out.set(-fx * this.sz / this.sx, 1, fy * this.sz / this.sy).normalize();
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
   * Gradient at grid node (i, j), from the samples already taken.
   *
   * Central differences where the neighbours exist, one-sided at the edges, and
   * an analytic fallback next to an undefined region. Differencing the grid
   * rather than re-evaluating f is both far cheaper and better behaved for
   * shading, because the normals then describe the mesh actually on screen.
   */
  gradientAt(i, j, out) {
    const { n, w } = this;
    const dx = (this.field.xmax - this.field.xmin) / n;
    const dy = (this.field.ymax - this.field.ymin) / n;
    const k = j * w + i;

    let gx = NaN, gy = NaN;
    if (this.valid[k]) {
      const l = i > 0 && this.valid[k - 1], r = i < n && this.valid[k + 1];
      if (l && r) gx = (this.z[k + 1] - this.z[k - 1]) / (2 * dx);
      else if (r) gx = (this.z[k + 1] - this.z[k]) / dx;
      else if (l) gx = (this.z[k] - this.z[k - 1]) / dx;

      const d = j > 0 && this.valid[k - w], u = j < n && this.valid[k + w];
      if (d && u) gy = (this.z[k + w] - this.z[k - w]) / (2 * dy);
      else if (u) gy = (this.z[k + w] - this.z[k]) / dy;
      else if (d) gy = (this.z[k] - this.z[k - w]) / dy;
    }

    if (!isFinite(gx) || !isFinite(gy)) {
      const g = this.field.gradient(this.x(i), this.y(j));
      gx = g[0]; gy = g[1];
    }
    out[0] = gx; out[1] = gy;
    return out;
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

  /** Normalised height in [0,1] over the full range. Drives the height ramp. */
  norm(z) { return (z - this.zmin) / (this.zmax - this.zmin); }

  /**
   * Normalised height over the *land* — the part above the waterline.
   *
   * The terrain bands have to be spread over ground you can actually stand on.
   * Measured against the full range, a surface that spends half its depth under
   * water would put beach, forest and meadow below the surface and leave every
   * visible slope in the arid and volcanic bands.
   */
  landNorm(z) {
    const base = this.zmin < 0 ? 0 : this.zmin;
    return (z - base) / Math.max(1e-9, this.zmax - base);
  }

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
