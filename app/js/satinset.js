/**
 * satinset.js — the campus from orbit, with its own height map laid over it.
 *
 * A corner card that answers one question a student asks in front of this
 * example and no other: *where on the actual photograph am I, and how high is
 * that?* The 3D scene shows the ground as a surface and the flat map shows it
 * as a field of colour, and neither of them shows the place — the streets, the
 * blocks, the shape of the campus — which is the thing a student from Santiago
 * recognises and can navigate by.
 *
 * So: the aerial photograph, at the window currently open, with the height
 * ramp washed over it. The wash is deliberately pale and translucent — enough
 * that the gradient of the hillside is unmistakable, not so much that the
 * photograph underneath stops being a photograph. Which is the whole point:
 * the two readings of the same ground, one on top of the other, in one picture.
 *
 * Nothing here is part of the mathematics. It reads the same grid the surface
 * was built from and draws pixels; it has no opinion about f.
 */

import { heatColor } from './terrain.js';

/** How much of the height ramp shows through the photograph. */
const WASH = 0.42;
/** How far the ramp is pulled towards white before it is washed on. */
const PALE = 0.34;

export class SatelliteInset {
  /**
   * @param canvas   the card's canvas
   * @param source   () => ({ image, west, east, south, north }) in the domain's
   *                 own units, or null when there is no photograph
   */
  constructor(canvas, source) {
    this.canvas = canvas;
    this.source = source;
    this.ctx = canvas.getContext('2d');
    this.wash = document.createElement('canvas');
    this.washCtx = this.wash.getContext('2d');
    this.field = null;
    this.grid = null;
    this.dirty = true;
  }

  setField(field, grid) {
    this.field = field;
    this.grid = grid;
    this.dirty = true;
  }

  /**
   * Fit the canvas to the domain's shape inside a box.
   *
   * The two campus windows are 2.3 km by 1.8 km and 129 m by 926 m — one
   * almost square, the other a ribbon eight times taller than it is wide — and
   * a fixed rectangle would squash one of them into nonsense. The card takes
   * the aspect ratio of the window it is showing.
   */
  resize(maxW, maxH) {
    const f = this.field;
    if (!f) return;
    const ar = (f.xmax - f.xmin) / (f.ymax - f.ymin || 1);
    let w = maxW, h = maxW / ar;
    if (h > maxH) { h = maxH; w = maxH * ar; }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.max(1, Math.round(w * dpr)), ch = Math.max(1, Math.round(h * dpr));
    if (cw !== this.canvas.width || ch !== this.canvas.height) {
      this.canvas.width = cw; this.canvas.height = ch;
      this.dirty = true;
    }
    this.canvas.style.width = `${Math.round(w)}px`;
    this.canvas.style.height = `${Math.round(h)}px`;
  }

  /** Math (x, y) to canvas pixels; canvas y grows downward, the domain's up. */
  px(x) {
    const f = this.field;
    return ((x - f.xmin) / (f.xmax - f.xmin)) * this.canvas.width;
  }

  py(y) {
    const f = this.field;
    return (1 - (y - f.ymin) / (f.ymax - f.ymin)) * this.canvas.height;
  }

  /**
   * Photograph, then wash. Redrawn only when the surface changes, and blitted
   * every frame with the marker on top.
   */
  _rebuild() {
    const f = this.field, grid = this.grid, src = this.source && this.source();
    const W = this.canvas.width, H = this.canvas.height;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);
    if (!f || !grid || !src || !src.image) return;

    // --- the photograph ---------------------------------------------------
    //
    // Cropped by drawImage rather than sampled pixel by pixel, so the browser's
    // own resampler does the work: the window can be a fifth of a pixel of the
    // source wide and it still comes out smooth.
    const iw = src.image.width, ih = src.image.height;
    const ex = (src.east - src.west) || 1, ey = (src.north - src.south) || 1;
    const sx = ((f.xmin - src.west) / ex) * iw;
    const sy = ((src.north - f.ymax) / ey) * ih;
    const sw = ((f.xmax - f.xmin) / ex) * iw;
    const sh = ((f.ymax - f.ymin) / ey) * ih;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src.image, sx, sy, sw, sh, 0, 0, W, H);

    // --- the height, washed over it --------------------------------------
    this.wash.width = W; this.wash.height = H;
    const img = this.washCtx.createImageData(W, H);
    const d = img.data;
    const rgb = [0, 0, 0];
    for (let j = 0; j < H; j++) {
      const y = f.ymin + (1 - (j + 0.5) / H) * (f.ymax - f.ymin);
      for (let i = 0; i < W; i++) {
        const x = f.xmin + ((i + 0.5) / W) * (f.xmax - f.xmin);
        const z = grid.meshHeight(x, y);
        const k = (j * W + i) * 4;
        if (!isFinite(z)) { d[k + 3] = 0; continue; }
        heatColor(grid.norm(z), rgb);
        // Paler than the ramp itself. A full-strength heat map over a
        // photograph reads as a heat map with something behind it; pulled a
        // third of the way to white it reads as a photograph with the height
        // written on it, which is the picture that was asked for.
        d[k] = Math.round((rgb[0] + (1 - rgb[0]) * PALE) * 255);
        d[k + 1] = Math.round((rgb[1] + (1 - rgb[1]) * PALE) * 255);
        d[k + 2] = Math.round((rgb[2] + (1 - rgb[2]) * PALE) * 255);
        d[k + 3] = 255;
      }
    }
    this.washCtx.putImageData(img, 0, 0);
    ctx.save();
    ctx.globalAlpha = WASH;
    ctx.drawImage(this.wash, 0, 0);
    ctx.restore();

    this.base = ctx.getImageData(0, 0, W, H);
    this.dirty = false;
  }

  /**
   * @param opts { player: {x, y}, contour: [x, y, …] }
   */
  draw(opts) {
    if (!this.field || !this.grid) return;
    if (this.dirty || !this.base) this._rebuild();
    if (!this.base) return;
    const ctx = this.ctx;
    ctx.putImageData(this.base, 0, 0);

    const o = opts || {};
    const s = Math.min(this.canvas.width, this.canvas.height);

    // The contour the explorer is standing on, so the card says the same thing
    // as the scene and the flat map.
    if (o.contour && o.contour.length >= 4) {
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(this.px(o.contour[0]), this.py(o.contour[1]));
      for (let i = 2; i + 1 < o.contour.length; i += 2) {
        ctx.lineTo(this.px(o.contour[i]), this.py(o.contour[i + 1]));
      }
      ctx.strokeStyle = 'rgba(8, 12, 18, .65)';
      ctx.lineWidth = Math.max(2.4, s * 0.022);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 255, 255, .92)';
      ctx.lineWidth = Math.max(1.2, s * 0.011);
      ctx.stroke();
    }

    if (o.player) {
      const r = Math.max(2.5, s * 0.022);
      const x = this.px(o.player.x), y = this.py(o.player.y);
      ctx.beginPath();
      ctx.arc(x, y, r * 1.7, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(8, 12, 18, .55)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = '#7ef0d4';
      ctx.fill();
    }
  }
}
