/**
 * campus.js — Universidad de los Andes, San Carlos de Apoquindo, as a surface.
 *
 * A place, rather than a landscape. The window is the one the request named,
 * 70°30′40″W to 70°29′15″W by 33°24′S to 33°25′S: a rectangle two kilometres
 * across on the Andean foot slope at the eastern edge of Santiago, with the
 * university on it and five hundred metres of relief behind it.
 *
 * Three sources, kept apart on purpose
 * ------------------------------------
 * The *function* is the ground and nothing else: a finite cosine series fitted
 * to the public elevation model, exactly as the mountains are, so that it is
 * infinitely differentiable and every gradient, level curve, tangent plane and
 * geodesic the program draws is an exact object rather than an artefact of a
 * sampling grid. See elias.js for the argument in full.
 *
 * The vegetation and the buildings are *not* part of the function. They stand
 * on it. ESA WorldCover says, at ten metres, whether a patch of ground is trees,
 * scrub, grass, bare or built; the decoration reads that instead of inventing a
 * biome, so the trees on screen are where the trees are. Overture Maps supplies
 * fifteen hundred real building outlines with real heights where the source has
 * them, and those are drawn as objects sitting on the surface.
 *
 * That separation is the pedagogically important part and it is worth saying
 * out loud to a class: f(x, y) is the altitude of the *ground*. Walking into a
 * building does not change f, a roof is not a local maximum of f, and the
 * gradient at the library door is the slope of the hillside the library was
 * built on. The scenery is evidence about the place; the mathematics is about
 * the surface underneath it.
 */

import { CAMPUS, QUANTUM, COVER_CLASSES } from './campus-data.js';
import { SAT } from './campus-sat.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const VALUE = (() => {
  const v = new Int8Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) v[ALPHABET.charCodeAt(i)] = i;
  return v;
})();

/** Zigzag base-64 varints, as a generator over one string. */
function* nums(s) {
  let i = 0;
  while (i < s.length) {
    let z = 0, shift = 1, ch;
    do {
      ch = VALUE[s.charCodeAt(i++)];
      z += (ch & 31) * shift;
      shift *= 32;
    } while (ch & 32);
    yield (z & 1) ? -(z + 1) / 2 : z / 2;
  }
}

/* --------------------------------------------------------- the ground */

const { M, halfX, halfY } = CAMPUS;

const coeffs = (() => {
  const c = new Float64Array(M * M);
  let k = 0;
  for (const n of nums(CAMPUS.d)) { if (k >= c.length) break; c[k++] = n * QUANTUM; }
  return c;
})();

const CJ = new Float64Array(M);
const CK = new Float64Array(M);
const D = new Float64Array(M);
let cachedY = NaN;

/**
 * Elevation in kilometres at (x, y) kilometres east and north of the window's
 * centre. NaN outside it: the survey ends where the request said it ends.
 *
 * Row-coherent, like every other surface here — for a fixed y the double sum
 * collapses to one sum over x-modes, and cos(n t) comes from the Chebyshev
 * recurrence rather than M calls into Math.cos.
 */
export function campusHeight(x, y) {
  if (!(x >= -halfX && x <= halfX && y >= -halfY && y <= halfY)) return NaN;

  if (y !== cachedY) {
    const ty = Math.PI * (y + halfY) / (2 * halfY);
    CK[0] = 1;
    if (M > 1) CK[1] = Math.cos(ty);
    for (let k = 2; k < M; k++) CK[k] = 2 * CK[1] * CK[k - 1] - CK[k - 2];
    for (let j = 0; j < M; j++) {
      let s = 0;
      for (let k = 0; k < M; k++) s += coeffs[k * M + j] * CK[k];
      D[j] = s;
    }
    cachedY = y;
  }

  const tx = Math.PI * (x + halfX) / (2 * halfX);
  CJ[0] = 1;
  if (M > 1) CJ[1] = Math.cos(tx);
  for (let j = 2; j < M; j++) CJ[j] = 2 * CJ[1] * CJ[j - 1] - CJ[j - 2];

  let v = 0;
  for (let j = 0; j < M; j++) v += D[j] * CJ[j];
  return v / 1000;
}

/* ---------------------------------------------------- the land  cover */

/**
 * ESA WorldCover classes, decoded once from their run lengths.
 *
 * The raster is in degrees, west to east and north to south, so a kilometre in
 * the local frame turns back into a cell through the same linear map the
 * builder used. Ten metres a cell is a good deal finer than the ground a tree
 * covers, which is the resolution that matters here.
 */
const cover = (() => {
  const { nx, ny } = CAMPUS.cover;
  const g = new Uint8Array(nx * ny);
  let k = 0, cls = 0, turn = 0;
  for (const n of nums(CAMPUS.cv)) {
    if (turn === 0) { cls = n; turn = 1; continue; }
    for (let i = 0; i < n && k < g.length; i++) g[k++] = cls;
    turn = 0;
  }
  return g;
})();

const KY = 110.574;
const KX = 111.320 * Math.cos((CAMPUS.lat * Math.PI) / 180);

/** The WorldCover class at a point, as the ESA code (10 tree, 20 shrub, …). */
export function coverAt(x, y) {
  const c = CAMPUS.cover;
  const lon = CAMPUS.lon + x / KX;
  const lat = CAMPUS.lat + y / KY;
  const i = Math.floor((lon - c.west) / c.px);
  const j = Math.floor((c.north - lat) / c.py);
  if (i < 0 || j < 0 || i >= c.nx || j >= c.ny) return 0;
  return COVER_CLASSES[cover[j * c.nx + i]] ?? 0;
}

/* ------------------------------------------------------ the buildings */

/**
 * Building outlines in local kilometres, with a height in metres.
 *
 * Decoded lazily: a student who never opens this example should not pay for
 * fifteen hundred polygons, and one who does pays once.
 */
let footprints = null;
export function buildings() {
  if (footprints) return footprints;
  const out = [];
  const it = nums(CAMPUS.b);
  const step = CAMPUS.step;
  for (;;) {
    const a = it.next(); if (a.done) break;
    const b = it.next(); if (b.done) break;
    const n = a.value, h = b.value / 10;
    const ring = new Float32Array(n * 2);
    let px = 0, py = 0, ok = true;
    for (let i = 0; i < n; i++) {
      const dx = it.next(), dy = it.next();
      if (dx.done || dy.done) { ok = false; break; }
      px += dx.value; py += dy.value;
      ring[i * 2] = px * step;
      ring[i * 2 + 1] = py * step;
    }
    if (!ok) break;
    out.push({ ring, height: h });
  }
  footprints = out;
  return out;
}

/* ----------------------------------------------------- from orbit */

/**
 * The satellite image, decoded once and sampled per vertex.
 *
 * Google's photorealistic 3D tiles need an API key and a billing account, and
 * could not be redistributed inside a file a teacher hands out anyway, so the
 * buildings here are Overture footprints with real heights. This is the other
 * thing that was asked for instead: Sentinel-2 true colour at ten metres,
 * painted onto the ground as its albedo and lit by the same sun as everything
 * else, so the campus reads as the aerial photograph a student recognises.
 *
 * Decoding is asynchronous because that is the only way a browser will turn a
 * JPEG into pixels, and the surface is built synchronously — so the promise is
 * started at import, long before anyone can choose this example, and the
 * colouring falls back to the land-cover palette if it is somehow not ready.
 */
let satPixels = null;
let satCanvas = null;
const satReady = (async () => {
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise((res, rej) => {
      img.onload = res; img.onerror = () => rej(new Error('satellite image failed to decode'));
      img.src = SAT.src;
    });
    const c = document.createElement('canvas');
    c.width = SAT.nx; c.height = SAT.ny;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    satPixels = g.getImageData(0, 0, SAT.nx, SAT.ny).data;
    satCanvas = c;
  } catch {
    satPixels = null;                 // the land cover carries on regardless
    satCanvas = null;
  }
  return !!satPixels;
})();

/**
 * The decoded image itself, for whoever wants to hand it to the graphics card
 * or draw it into a corner of the screen.
 *
 * Kept as a canvas rather than the Image, because the same pixels are wanted
 * three ways — read back one at a time for the flat map, uploaded as a texture
 * for the ground, and blitted into the inset — and a canvas is the one form all
 * three accept.
 */
export function satelliteCanvas() { return satCanvas; }

/** The image's geographic extent, in the domain's own kilometres. */
export function satelliteWindow() {
  return {
    xmin: (SAT.west - CAMPUS.lon) * KX, xmax: (SAT.east - CAMPUS.lon) * KX,
    ymin: (SAT.south - CAMPUS.lat) * KY, ymax: (SAT.north - CAMPUS.lat) * KY,
  };
}

/** Resolves true once the image is ready to sample. */
export function satelliteReady() { return satReady; }
export function hasSatellite() { return !!satPixels; }

/**
 * Linear RGB at a point, or null outside the image.
 *
 * sRGB in, linear out: the renderer works in linear light and the surface's
 * vertex colours are multiplied into it, so handing over the stored byte
 * unchanged would wash the whole image out by roughly a gamma.
 */
const S2L = (() => {
  const t = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    t[i] = v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }
  return t;
})();

/**
 * Bilinear, not nearest.
 *
 * This is sampled once per mesh vertex, and on the named quadrant the mesh is
 * finer than a metre while the image is ten metres a pixel. Taking the nearest
 * pixel therefore painted the ground as a mosaic of ten-metre squares of flat
 * colour — the image was all there, and unreadable, because the eye sees the
 * grid instead of the place. Interpolating between the four surrounding pixels
 * adds nothing that is not in the data (it is the same information, resampled)
 * and removes the one artefact that was hiding it.
 *
 * A photograph is not a step function of position, so bilinear is also simply
 * the more honest reading of what the sensor recorded: the value stored for a
 * pixel is an average over its footprint, and the best estimate between two
 * footprints is between the two values.
 */
export function satelliteAt(x, y, out) {
  if (!satPixels) return null;
  const lon = CAMPUS.lon + x / KX;
  const lat = CAMPUS.lat + y / KY;
  // Continuous pixel coordinates, measured from pixel centres.
  const fx = ((lon - SAT.west) / (SAT.east - SAT.west)) * SAT.nx - 0.5;
  const fy = ((SAT.north - lat) / (SAT.north - SAT.south)) * SAT.ny - 0.5;
  if (!(fx > -1 && fy > -1 && fx < SAT.nx && fy < SAT.ny)) return null;

  const i0 = Math.floor(fx), j0 = Math.floor(fy);
  const tx = fx - i0, ty = fy - j0;
  // Clamp at the edges rather than dropping out of the image: the last half
  // pixel of the window is still inside the survey.
  const cx0 = Math.max(0, Math.min(SAT.nx - 1, i0)), cx1 = Math.max(0, Math.min(SAT.nx - 1, i0 + 1));
  const cy0 = Math.max(0, Math.min(SAT.ny - 1, j0)), cy1 = Math.max(0, Math.min(SAT.ny - 1, j0 + 1));

  const a = (cy0 * SAT.nx + cx0) * 4, b = (cy0 * SAT.nx + cx1) * 4;
  const c = (cy1 * SAT.nx + cx0) * 4, d = (cy1 * SAT.nx + cx1) * 4;
  const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty);
  const w01 = (1 - tx) * ty, w11 = tx * ty;

  // Interpolate in linear light, not in stored bytes: the transfer curve is a
  // 2.4 power, and mixing two sRGB codes then converting is not the same as
  // converting then mixing. On a bright roof beside dark ground the difference
  // is visible as a dark fringe.
  for (let ch = 0; ch < 3; ch++) {
    out[ch] = S2L[satPixels[a + ch]] * w00 + S2L[satPixels[b + ch]] * w10
      + S2L[satPixels[c + ch]] * w01 + S2L[satPixels[d + ch]] * w11;
  }
  return out;
}

export const SAT_INFO = { scene: SAT.scene, cloud: SAT.cloud, credit: SAT.credit };

/**
 * Where to put the explorer when the map opens.
 *
 * The centre of the rectangle the request named is a patch of hillside scrub;
 * the university is towards its western edge. Rather than hard-coding a
 * coordinate for it, this takes the centroid of the built-up cells in the
 * survey — which is, by construction, the middle of the built ground — so the
 * start point is derived from the same data as everything else here and cannot
 * drift away from it.
 */
export function startPoint() {
  const c = CAMPUS.cover;
  const built = COVER_CLASSES.indexOf(50);
  let sx = 0, sy = 0, n = 0;
  for (let j = 0; j < c.ny; j++) {
    for (let i = 0; i < c.nx; i++) {
      if (cover[j * c.nx + i] !== built) continue;
      const lon = c.west + (i + 0.5) * c.px;
      const lat = c.north - (j + 0.5) * c.py;
      sx += (lon - CAMPUS.lon) * KX;
      sy += (lat - CAMPUS.lat) * KY;
      n++;
    }
  }
  if (!n) return { x: 0, y: 0 };
  return {
    x: Math.max(-halfX * 0.95, Math.min(halfX * 0.95, sx / n)),
    y: Math.max(-halfY * 0.95, Math.min(halfY * 0.95, sy / n)),
  };
}

/** The window, for the preset and the tests. */
export const CAMPUS_INFO = {
  xmin: -halfX, xmax: halfX,
  ymin: -halfY, ymax: halfY,
  low: CAMPUS.ground.low,
  high: CAMPUS.ground.high,
  rms: CAMPUS.rms,
  count: CAMPUS.buildings,
  lat: CAMPUS.lat, lon: CAMPUS.lon,
  west: CAMPUS.west, east: CAMPUS.east, south: CAMPUS.south, north: CAMPUS.north,
  // The sliver named in the request, in the same local kilometres.
  quadrant: CAMPUS.quadrant,
};
