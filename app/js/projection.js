/**
 * projection.js — the flat picture, beside the solid one.
 *
 * Every textbook draws a function of two variables the same way: a rectangle of
 * the plane, contours on it, maybe a heat map behind them. Every student then
 * has to build the third dimension in their head. This panel puts that flat
 * picture in the corner of the 3D scene and drives it from the same state, so
 * the translation is not something to imagine — the contour under the
 * explorer's feet and the closed loop on the map are visibly one object.
 *
 * It is a 2D canvas rather than a second WebGL view, for three reasons: the
 * heat map is one ImageData write, the contours can be hairlines at exactly the
 * colours the 3D paths use, and the whole thing composites at whatever opacity
 * the dial asks for without touching the scene.
 *
 * Axis convention matches the plot: x to the right, y **up** the panel. Canvas
 * y grows downward, so every write flips it. Getting that backwards would
 * mirror the map against the terrain, which is worse than not drawing it.
 */

import { heightColor } from './terrain.js';

/** A conventional heat map, for when the topographic ramp is not wanted. */
function heatColor(h, out) {
  // Blue → cyan → green → yellow → red: the palette a student will have seen
  // on every other heat map, deliberately different from the height ramp so
  // the two modes cannot be confused with each other.
  const stops = [
    [0.19, 0.22, 0.62], [0.13, 0.62, 0.75], [0.35, 0.76, 0.35],
    [0.96, 0.85, 0.24], [0.85, 0.20, 0.15],
  ];
  const t = Math.min(1, Math.max(0, h)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(t));
  const f = t - i, a = stops[i], b = stops[i + 1];
  out[0] = a[0] + (b[0] - a[0]) * f;
  out[1] = a[1] + (b[1] - a[1]) * f;
  out[2] = a[2] + (b[2] - a[2]) * f;
  return out;
}

export class Projection {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.base = document.createElement('canvas');
    this.baseCtx = this.base.getContext('2d');
    this.field = null;
    this.grid = null;
    this.levels = [];
    this.mode = 'ramp';        // 'off' | 'heat' | 'ramp' | 'down'
    this.dirty = true;
  }

  /** Math (x, y) to panel pixels. y is flipped, because canvas y goes down. */
  px(x) {
    const f = this.field;
    return ((x - f.xmin) / (f.xmax - f.xmin)) * this.canvas.width;
  }

  py(y) {
    const f = this.field;
    return (1 - (y - f.ymin) / (f.ymax - f.ymin)) * this.canvas.height;
  }

  setField(field, grid, levels) {
    this.field = field;
    this.grid = grid;
    this.levels = levels || [];
    this.dirty = true;
  }

  resize(w, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.max(1, Math.round(w * dpr));
    const H = Math.max(1, Math.round(h * dpr));
    if (this.canvas.width === W && this.canvas.height === H) return;
    this.canvas.width = W;
    this.canvas.height = H;
    this.base.width = W;
    this.base.height = H;
    this.dirty = true;
  }

  /**
   * The layer that only changes when the function does: the heat map and the
   * contour set. Drawn once into an offscreen canvas and blitted every frame,
   * because marching a 300 × 300 grid sixty times a second for a picture that
   * has not moved would be absurd.
   */
  _rebuildBase() {
    const { grid, field } = this;
    const W = this.base.width, H = this.base.height;
    const ctx = this.baseCtx;
    ctx.clearRect(0, 0, W, H);
    if (!grid || !field || this.mode === 'off' || this.mode === 'down') { this.dirty = false; return; }

    // --- the heat map, one pixel at a time -------------------------------
    const img = ctx.createImageData(W, H);
    const d = img.data;
    const rgb = [0, 0, 0];
    const paint = this.mode === 'heat' ? heatColor : heightColor;
    for (let j = 0; j < H; j++) {
      const y = field.ymin + (1 - (j + 0.5) / H) * (field.ymax - field.ymin);
      for (let i = 0; i < W; i++) {
        const x = field.xmin + ((i + 0.5) / W) * (field.xmax - field.xmin);
        const z = grid.meshHeight(x, y);
        const k = (j * W + i) * 4;
        if (!isFinite(z)) { d[k + 3] = 0; continue; }   // outside the domain of f
        paint(grid.norm(z), rgb);
        d[k] = Math.round(rgb[0] * 255);
        d[k + 1] = Math.round(rgb[1] * 255);
        d[k + 2] = Math.round(rgb[2] * 255);
        d[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.dirty = false;
  }

  /**
   * Marching squares again, but for hairlines this time.
   *
   * The 3D version has to build ribbons draped over the ground; here a contour
   * is one stroked segment per cell, which is what the textbook picture is.
   */
  _strokeContours(ctx, lineWidth) {
    const { grid, field } = this;
    const { n, w } = grid;
    const rgb = [0, 0, 0];
    ctx.lineCap = 'round';

    for (const level of this.levels) {
      heightColor(grid.norm(level), rgb);
      ctx.beginPath();
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const ka = j * w + i, kb = j * w + i + 1, kc = (j + 1) * w + i + 1, kd = (j + 1) * w + i;
          if (!(grid.valid[ka] && grid.valid[kb] && grid.valid[kc] && grid.valid[kd])) continue;
          const z0 = grid.z[ka], z1 = grid.z[kb], z2 = grid.z[kc], z3 = grid.z[kd];
          const b0 = z0 >= level, b1 = z1 >= level, b2 = z2 >= level, b3 = z3 >= level;
          if (b0 === b1 && b1 === b2 && b2 === b3) continue;

          const x0 = grid.x(i), x1 = grid.x(i + 1), y0 = grid.y(j), y1 = grid.y(j + 1);
          const lerp = (za, zb, xa, ya, xb, yb) => {
            const t = (level - za) / (zb - za);
            return [xa + (xb - xa) * t, ya + (yb - ya) * t];
          };
          const pts = [];
          if (b0 !== b1) pts.push(lerp(z0, z1, x0, y0, x1, y0));
          if (b1 !== b2) pts.push(lerp(z1, z2, x1, y0, x1, y1));
          if (b2 !== b3) pts.push(lerp(z2, z3, x1, y1, x0, y1));
          if (b3 !== b0) pts.push(lerp(z3, z0, x0, y1, x0, y0));
          for (let q = 0; q + 1 < pts.length; q += 2) {
            ctx.moveTo(this.px(pts[q][0]), this.py(pts[q][1]));
            ctx.lineTo(this.px(pts[q + 1][0]), this.py(pts[q + 1][1]));
          }
        }
      }
      // Twice: a dark halo, then the height colour on top.
      //
      // The contour's colour and the heat map's colour come from the same ramp
      // at the same height, so on the ramp background a plain stroke is drawn
      // in exactly the colour it is standing on and disappears. The halo is
      // what makes a level curve visible against its own level.
      ctx.strokeStyle = 'rgba(8, 12, 18, .55)';
      ctx.lineWidth = lineWidth * 2.6;
      ctx.stroke();
      ctx.strokeStyle = `rgb(${Math.round(rgb[0] * 255)},${Math.round(rgb[1] * 255)},${Math.round(rgb[2] * 255)})`;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  }

  /**
   * @param opts {
   *   contours, curve (array of x,y pairs), curveRGB, tangent {x,y,ux,uy},
   *   player {x,y}, feasible (predicate), showFeasible
   * }
   */
  draw(opts) {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (!this.field || !this.grid || this.mode === 'off' || this.mode === 'down') return;

    if (this.dirty) this._rebuildBase();
    ctx.drawImage(this.base, 0, 0);

    const s = Math.min(W, H);
    const unit = s / 260;                     // one "line width" at this size

    // The budget set, or whatever the feasible set is, as a wash.
    if (opts.showFeasible && opts.feasible) {
      ctx.save();
      ctx.globalAlpha = 0.30;
      ctx.fillStyle = '#0b0f16';
      const step = Math.max(2, Math.round(s / 140));
      for (let j = 0; j < H; j += step) {
        const y = this.field.ymin + (1 - (j + 0.5) / H) * (this.field.ymax - this.field.ymin);
        for (let i = 0; i < W; i += step) {
          const x = this.field.xmin + ((i + 0.5) / W) * (this.field.xmax - this.field.xmin);
          if (!opts.feasible(x, y)) ctx.fillRect(i, j, step, step);
        }
      }
      ctx.restore();
    }

    if (opts.contours) this._strokeContours(ctx, Math.max(1, unit * 0.9));

    // The contour through the explorer, in its own height's colour, drawn
    // heavier than the rest — the same emphasis it has in the scene.
    if (opts.curve && opts.curve.length >= 4) {
      const c = opts.curveRGB || [1, 1, 1];
      const wid = Math.max(1.6, unit * 2.6);
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(this.px(opts.curve[0]), this.py(opts.curve[1]));
      for (let i = 2; i + 1 < opts.curve.length; i += 2) {
        ctx.lineTo(this.px(opts.curve[i]), this.py(opts.curve[i + 1]));
      }
      ctx.strokeStyle = 'rgba(8, 12, 18, .7)';
      ctx.lineWidth = wid * 2.1;
      ctx.stroke();
      ctx.strokeStyle = `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
      ctx.lineWidth = wid;
      ctx.stroke();
    }

    // The tangent to that contour: straight here, because in the plane it is.
    if (opts.tangent) {
      const { x, y, ux, uy } = opts.tangent;
      const L = Math.max(this.field.xmax - this.field.xmin, this.field.ymax - this.field.ymin) * 0.28;
      ctx.strokeStyle = '#ff2f9e';
      ctx.lineWidth = Math.max(1.4, unit * 1.9);
      ctx.beginPath();
      ctx.moveTo(this.px(x - ux * L), this.py(y - uy * L));
      ctx.lineTo(this.px(x + ux * L), this.py(y + uy * L));
      ctx.stroke();
    }

    // The explorer, as the dot a textbook would draw — exaggerated, because a
    // person is a point on this scale and a point cannot be seen.
    if (opts.player) {
      const cx = this.px(opts.player.x), cy = this.py(opts.player.y);
      const r = Math.max(3.5, unit * 4.2);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#ff7a2f';
      ctx.fill();
      ctx.lineWidth = Math.max(1.2, unit * 1.2);
      ctx.strokeStyle = 'rgba(12,16,22,.85)';
      ctx.stroke();
    }

    // A hairline frame, so the panel reads as a plot and not as a smear.
    ctx.strokeStyle = 'rgba(255,255,255,.28)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  }
}
