/**
 * compass.js — which way am I looking?
 *
 * In a first-person view of a surface with no landmarks — the inside of a
 * torus, a Möbius strip, a paraboloid at 1:10000 scale — it is genuinely easy
 * to lose track of your own orientation, and losing it makes every reading on
 * the screen harder to interpret. This is the instrument that answers it: a
 * wire cage of latitude and longitude, like a globe, with a small figure inside
 * turned the way the camera is turned.
 *
 * The projection
 * --------------
 * A direction is a unit triple (lateral, forward, azimuth) — x to the right, y
 * forward, z up, the same axes the plot uses. It is flattened by
 *
 *     P(x, y, z) = (x + y·sin θ,  y·cos θ + z),      θ = 0.9 radians
 *
 * which sends the six cardinal directions to
 *
 *     right   (1,0,0)  → ( 1, 0)          up   (0,0, 1) → (0,  1)
 *     left   (−1,0,0)  → (−1, 0)          down (0,0,−1) → (0, −1)
 *     forward (0,1,0)  → ( sin θ,  cos θ) — up and to the right, 38° above
 *     back   (0,−1,0)  → (−sin θ, −cos θ) — down and to the left
 *
 * The forward axis used to run down-right at −45°, straight through the
 * figure's own body and legs. Swinging it up above the horizon puts it in clear
 * air, at the cost of bringing it within 52° of the z axis instead of 135°;
 * that is a legibility trade, and the arrow's length and the numeric bearing
 * underneath are what disambiguate the two when they are close.
 *
 * This is an oblique projection, not an orthographic one: all six cardinal
 * directions land on the unit circle, but a diagonal like right-plus-forward
 * runs past it, so the silhouette of the sphere is an ellipse rather than a
 * circle. That is a real consequence of putting the depth axis at an angle
 * without foreshortening it, and it is what makes the forward direction legible
 * instead of collapsing it into the frame.
 *
 * Depth. P has a one-dimensional kernel — the direction it is looking along —
 * found by solving x + y·sin θ = 0 and y·cos θ + z = 0, which gives
 * (−sin θ, 1, −cos θ). A point's dot product with that is how near the viewer
 * it is, so the far half of the cage can be drawn faintly and the figure can
 * turn its back. Forward lands on the positive side of it, which is what makes
 * the default attitude a face rather than the back of a head.
 */

/** Where the forward axis is aimed in the picture, in radians from screen up. */
const FORWARD_ANGLE = 0.9;
const FS = Math.sin(FORWARD_ANGLE);
const FC = Math.cos(FORWARD_ANGLE);

/** The kernel of P, normalised: the axis the cage is viewed along. */
const VIEW = (() => {
  const v = [-FS, 1, -FC];
  const n = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / n, v[1] / n, v[2] / n];
})();

/**
 * Flatten a direction. Set MIRROR_LATERAL to −1 to swap left and right, which
 * is the whole difference between watching the figure from behind and watching
 * it face-on; the rest of the drawing is unaffected.
 */
const MIRROR_LATERAL = 1;

export function project(x, y, z, out) {
  out[0] = MIRROR_LATERAL * (x + y * FS);
  out[1] = y * FC + z;
  return out;
}

/** How near the viewer a direction points. Positive is towards. */
export function depthOf(x, y, z) {
  return x * VIEW[0] + y * VIEW[1] + z * VIEW[2];
}

/**
 * The silhouette of the unit sphere under P — an ellipse, because P is oblique.
 *
 * The singular values of P's matrix M are the semi-axes and the eigenvectors of
 * MMᵀ their directions, so this is one 2×2 eigenproblem, solved once. The head
 * is drawn to the same shape one size down; drawing it as a circle would put
 * the features outside their own head wherever the projection stretches most.
 */
export const SILHOUETTE = (() => {
  // M = [[1, FS, 0], [0, FC, 1]];  MMᵀ = [[1 + FS², FS·FC], [FS·FC, FC² + 1]]
  const a = 1 + FS * FS, b = FS * FC, c = FC * FC + 1;
  const tr = a + c, det = a * c - b * b;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = tr / 2 + disc, l2 = tr / 2 - disc;
  // Eigenvector for the larger eigenvalue, in projected coordinates.
  const ex = Math.abs(b) > 1e-12 ? b : 1;
  const ey = Math.abs(b) > 1e-12 ? l1 - a : 0;
  return {
    major: Math.sqrt(l1),
    minor: Math.sqrt(Math.max(0, l2)),
    // Canvas y grows downward, so the projected angle flips sign.
    angle: Math.atan2(-ey, ex),
  };
})();

const LAT = [-60, -30, 0, 30, 60];
const LON = [0, 45, 90, 135, 180, 225, 270, 315];
const D2R = Math.PI / 180;

export class Compass {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dir = [0, 1, 0];       // where the camera looks, in (x, y, z)
    this.drone = false;         // draw the aircraft rather than the figure
    this.active = 0;            // 0..1, how emphasised the instrument is
    this._p = [0, 0];
    this._size = 0;
  }

  /** @param dir unit triple (x right, y forward, z up) */
  setDirection(x, y, z) {
    const n = Math.hypot(x, y, z);
    if (!(n > 1e-9)) return;
    this.dir[0] = x / n; this.dir[1] = y / n; this.dir[2] = z / n;
  }

  setDrone(on) { this.drone = !!on; }

  resize() {
    const c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(c.clientWidth * dpr));
    const h = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    this._size = Math.min(w, h);
  }

  /** Screen coordinates of a direction, given the cage radius. */
  _at(x, y, z, cx, cy, R) {
    const p = project(x, y, z, this._p);
    // Canvas y grows downward; the projection's second coordinate is up.
    return [cx + p[0] * R, cy - p[1] * R];
  }

  /**
   * One wire of the cage, split at the horizon.
   *
   * A latitude or longitude circle runs behind the sphere and back out again,
   * so it cannot be one stroke: the far part has to be drawn faintly or the
   * cage reads as a flat doily instead of a globe. Segments are classified by
   * the depth of their midpoint, which is exact enough at this sampling.
   */
  _wire(pts, cx, cy, R, colour, width, isNear) {
    const ctx = this.ctx;
    ctx.beginPath();
    let drawing = false;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      const mid = depthOf((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
      if ((mid >= 0) !== isNear) { drawing = false; continue; }
      const sa = this._at(a[0], a[1], a[2], cx, cy, R);
      const sb = this._at(b[0], b[1], b[2], cx, cy, R);
      if (!drawing) { ctx.moveTo(sa[0], sa[1]); drawing = true; }
      ctx.lineTo(sb[0], sb[1]);
    }
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  /**
   * Half the cage — the near half or the far half.
   *
   * Drawn in two passes with the figure between them, because that is what
   * makes the figure look like it is *inside* the globe rather than pasted on
   * top of a picture of one.
   */
  _cage(cx, cy, R, ink, lw, isNear) {
    const ring = (fn, steps) => {
      const pts = [];
      for (let i = 0; i <= steps; i++) pts.push(fn(i / steps));
      return pts;
    };
    const dim = isNear ? 1 : 0.32;

    for (const latDeg of LAT) {
      const s = Math.sin(latDeg * D2R), c = Math.cos(latDeg * D2R);
      const eq = latDeg === 0;
      this._wire(
        ring((t) => {
          const th = t * Math.PI * 2;
          return [c * Math.cos(th), c * Math.sin(th), s];
        }, 72),
        cx, cy, R, ink((eq ? 0.85 : 0.40) * dim), lw * (eq ? 1.5 : 1) * (isNear ? 1 : 0.85), isNear,
      );
    }

    for (const lonDeg of LON) {
      const co = Math.cos(lonDeg * D2R), si = Math.sin(lonDeg * D2R);
      // The meridian through forward and back is the one a student orients by.
      const key = lonDeg === 90 || lonDeg === 270;
      this._wire(
        ring((t) => {
          const ph = -Math.PI / 2 + t * Math.PI;
          const c = Math.cos(ph);
          return [c * co, c * si, Math.sin(ph)];
        }, 48),
        cx, cy, R, ink((key ? 0.68 : 0.33) * dim), lw * (key ? 1.3 : 1) * (isNear ? 1 : 0.85), isNear,
      );
    }
  }

  /** The ray out to where the camera is aimed, with a flat head on the end. */
  _ray(cx, cy, R, S, ux, uy, lw, near) {
    const ctx = this.ctx;
    const d = this.dir;
    const tip = this._at(d[0], d[1], d[2], cx, cy, R);
    const colour = near ? 'rgba(89, 247, 214, .95)' : 'rgba(89, 247, 214, .34)';

    ctx.strokeStyle = colour;
    ctx.lineWidth = lw * 2.1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    // From the rim of the head, not from inside it.
    ctx.moveTo(cx + ux * S * 0.10, cy + uy * S * 0.10);
    ctx.lineTo(tip[0], tip[1]);
    ctx.stroke();

    const hs = S * 0.052;
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(tip[0] + ux * hs, tip[1] + uy * hs);
    ctx.lineTo(tip[0] - uy * hs * 0.62 - ux * hs * 0.5, tip[1] + ux * hs * 0.62 - uy * hs * 0.5);
    ctx.lineTo(tip[0] + uy * hs * 0.62 - ux * hs * 0.5, tip[1] - ux * hs * 0.62 - uy * hs * 0.5);
    ctx.closePath();
    ctx.fill();
  }

  draw() {
    this.resize();
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const S = this._size;
    ctx.clearRect(0, 0, W, H);
    if (S < 8) return;

    const cx = W / 2, cy = H / 2;
    // The projected sphere is an ellipse, so the radius is set from its long
    // axis rather than guessed: the cage then spans the same fraction of the
    // widget whatever angle the forward axis is drawn at, and cannot be clipped
    // by the edge if that angle is retuned.
    const R = ((S * 0.425) / SILHOUETTE.major) * (1 + this.active * 0.05);
    const a = this.active;
    const ink = (o) => `rgba(226, 238, 250, ${o * (0.62 + a * 0.38)})`;
    const lw = Math.max(1, S / 150);

    const d = this.dir;
    const near = depthOf(d[0], d[1], d[2]) >= 0;
    const p = project(d[0], d[1], d[2], [0, 0]);
    const plen = Math.hypot(p[0], p[1]);
    // Where the face points in the picture. When a direction projects to
    // nothing — looking exactly along the axis the cage is viewed down — fall
    // back to "up the screen", so the face does not spin on a coin toss.
    const ux = plen > 1e-4 ? p[0] / plen : 0;
    const uy = plen > 1e-4 ? -p[1] / plen : -1;      // canvas y grows downward

    // Far cage, then the ray if it is going away from us, then the figure,
    // then the near cage: the ordering that puts the figure inside the globe.
    this._cage(cx, cy, R, ink, lw, false);
    if (!near) this._ray(cx, cy, R, S, ux, uy, lw, false);

    if (this.drone) this._drawDrone(cx, cy, S, ux, uy, near, lw);
    else this._drawFigure(cx, cy, S, ux, uy, near, lw);

    this._cage(cx, cy, R, ink, lw, true);
    if (near) this._ray(cx, cy, R, S, ux, uy, lw, true);

    // --- axis labels ------------------------------------------------------
    ctx.font = `${Math.round(S * 0.085)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [v, label] of [
      [[1, 0, 0], 'x'], [[0, 1, 0], 'y'], [[0, 0, 1], 'z'],
    ]) {
      const s = this._at(v[0] * 1.2, v[1] * 1.2, v[2] * 1.2, cx, cy, R);
      ctx.fillStyle = ink(depthOf(v[0], v[1], v[2]) >= 0 ? 0.85 : 0.34);
      ctx.fillText(label, s[0], s[1]);
    }
  }

  /**
   * A blocky little person, facing where the camera faces.
   *
   * The features follow the *projected* direction — they slide, upright, within
   * the circle of the head, along P(d). Painting them on a three-dimensional
   * head instead is the obvious thing to try and it is worse: the head's
   * visible hemisphere is centred on the axis the cage is viewed down, the face
   * is centred on where the camera looks, and at most attitudes those are far
   * enough apart that the nose and the mouth are round the back. Correct, and
   * blank.
   *
   * Upright rather than rotated, too. Turning the eye-line to stay square to
   * the gaze would stand the eyes vertically the moment you looked sideways,
   * which is not looking sideways — it is tilting your head ninety degrees.
   *
   * Which way round the head is showing is the one thing the slide cannot say,
   * so depth says it: looking towards the viewer of the cage you get a face,
   * looking away you get the back of a head.
   */
  _drawFigure(cx, cy, S, ux, uy, near, lw) {
    const ctx = this.ctx;
    const r = S * 0.105;
    const skin = near ? '#f3d2a4' : '#b39a78';
    const dark = near ? '#151b24' : '#454c57';

    // A stub of shoulders and legs, so it reads as a person and not a ball.
    ctx.strokeStyle = near ? 'rgba(255,122,47,.92)' : 'rgba(255,122,47,.42)';
    ctx.lineWidth = lw * 2.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy + r * 0.95);
    ctx.lineTo(cx, cy + r * 1.95);
    ctx.moveTo(cx - r * 0.55, cy + r * 2.7);
    ctx.lineTo(cx, cy + r * 1.95);
    ctx.lineTo(cx + r * 0.55, cy + r * 2.7);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = skin;
    ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = lw * 1.1;
    ctx.stroke();

    // Where the features gather. Far enough to be unmistakable, near enough
    // that the lowest of them stays on the head.
    const slide = r * 0.40;
    const ox = cx + ux * slide, oy = cy + uy * slide;

    ctx.fillStyle = dark;
    const blk = (dx, dy, w, h) => ctx.fillRect(
      ox + dx * r - (w * r) / 2, oy + dy * r - (h * r) / 2, w * r, h * r,
    );

    if (near) {
      blk(-0.30, -0.20, 0.20, 0.26);        // eyes
      blk(0.30, -0.20, 0.20, 0.26);
      blk(0, 0.06, 0.14, 0.24);             // nose
      blk(-0.24, 0.36, 0.16, 0.13);         // a mouth of studs, LEGO fashion
      blk(-0.08, 0.40, 0.16, 0.13);
      blk(0.08, 0.40, 0.16, 0.13);
      blk(0.24, 0.36, 0.16, 0.13);
    } else {
      // The back of the head: a cap, opposite the way the face is pointing.
      ctx.beginPath();
      ctx.arc(cx - ux * r * 0.18, cy - uy * r * 0.18, r * 0.62, 0, Math.PI * 2);
      ctx.fillStyle = near ? '#3a2a1a' : '#4a4038';
      ctx.fill();
    }
  }

  /**
   * The quadrotor, when the flying camera is the one on screen.
   *
   * The airframe is held level — four rotors in the world's horizontal plane —
   * and only the lens swings, which is how the aircraft in the scene is built
   * and therefore what the instrument ought to show.
   */
  _drawDrone(cx, cy, S, ux, uy, near, lw) {
    const ctx = this.ctx;
    const r = S * 0.115;
    const body = near ? '#8fd8ff' : '#5d7f92';
    const dark = near ? '#151b24' : '#454c57';

    const at = (x, y, z) => {
      const q = project(x, y, z, [0, 0]);
      return [cx + q[0] * r, cy - q[1] * r];
    };
    const arms = [[0.72, 0.72], [0.72, -0.72], [-0.72, 0.72], [-0.72, -0.72]];

    ctx.strokeStyle = dark;
    ctx.lineWidth = lw * 1.8;
    ctx.beginPath();
    for (const [a, b] of arms) {
      const s = at(a, b, 0);
      ctx.moveTo(cx, cy);
      ctx.lineTo(s[0], s[1]);
    }
    ctx.stroke();

    ctx.fillStyle = body;
    for (const [a, b] of arms) {
      const s = at(a, b, 0);
      ctx.beginPath();
      ctx.arc(s[0], s[1], r * 0.30, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.40, 0, Math.PI * 2);
    ctx.fillStyle = dark;
    ctx.fill();

    // The lens, pointing where the camera points.
    ctx.strokeStyle = body;
    ctx.lineWidth = lw * 2.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + ux * r * 0.78, cy + uy * r * 0.78);
    ctx.stroke();
  }
}

/**
 * Azimuth and elevation of a direction, in degrees — the two numbers the cage
 * is a picture of.
 *
 * Azimuth is measured from forward (math +y) towards the right (math +x), so
 * 0° is straight ahead and 90° is due right, matching the way a bearing reads.
 */
export function angles(x, y, z) {
  const flat = Math.hypot(x, y);
  return {
    az: Math.round((Math.atan2(x, y) * 180) / Math.PI),
    el: Math.round((Math.atan2(z, flat) * 180) / Math.PI),
  };
}
