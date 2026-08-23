/**
 * build-elias.mjs — bake Mount Saint Elias into the bundle.
 *
 * The mountain the program gets to keep: a real digital elevation model of the
 * 40 km around the summit of Mount Saint Elias (Was'eitushaa, Boundary Peak
 * 186; 60°17′32″N 140°55′53″W, 5 489 m), fetched once at build time and
 * carried as data, because the app has no network when a student opens it.
 *
 * Source: the AWS Open Data terrain tiles (the former Mapzen "terrarium"
 * tiles) — a public-domain mosaic that in this corner of the world is the
 * USGS 3DEP/NED model on the Alaska side and Canada's CDEM on the Yukon side,
 * with bathymetry in the sea. Elevation is encoded in the pixels:
 * h = R·256 + G + B/256 − 32768, in metres.
 *
 * The grid is written in a local tangent plane: x km east of the summit,
 * y km north of it, sampled every 150 m — the same order of spacing as the
 * default render mesh over this window, so the data is at the picture's own
 * resolution. Heights are quantised to whole metres (the source's own
 * vertical accuracy is metres) and delta-encoded as the same base-64 varints
 * the coastline data uses.
 *
 * The boundary comes out of Natural Earth's countries (public domain, the
 * copy already fetched for the world map): the shared US–Canada arc, cut to
 * this window and reduced to the two straight legs it genuinely is here —
 * the 141°W meridian coming down from the north, and the 1903 tribunal's
 * straight segment through the boundary peaks running ESE past the summit.
 *
 *   node tools/build-elias.mjs path/to/countries-10m.json
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';

const here = dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------ geometry */

const LAT0 = 60 + 17 / 60 + 32 / 3600;        // the summit
const LON0 = -(140 + 55 / 60 + 53 / 3600);
const KX = 111.320 * Math.cos((LAT0 * Math.PI) / 180);  // km per degree of lon
const KY = 110.574;                                     // km per degree of lat

// The window, in km about the summit: the ocean is ~25 km to the southwest,
// the boundary's meridian leg ~4 km to the west, so this frames sea, icefall,
// summit and frontier in one picture.
const X0 = -30, X1 = 10, Y0 = -28, Y1 = 12;
const STEP = 0.15;                             // km between samples
const NX = Math.round((X1 - X0) / STEP) + 1;
const NY = Math.round((Y1 - Y0) / STEP) + 1;

const Z = 12;                                  // tile zoom: ~19 m/px here

/* ------------------------------------------------------- tile plumbing */

const lonOf = (x) => LON0 + x / KX;
const latOf = (y) => LAT0 + y / KY;

function tileXY(lon, lat, z) {
  const n = 2 ** z;
  const xr = ((lon + 180) / 360) * n;
  const rad = (lat * Math.PI) / 180;
  const yr = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  return [xr, yr];                              // fractional tile coordinates
}

const cache = new Map();

async function tile(tx, ty) {
  const key = `${tx}/${ty}`;
  if (cache.has(key)) return cache.get(key);
  const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${tx}/${ty}.png`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  const png = PNG.sync.read(Buffer.from(await res.arrayBuffer()));
  cache.set(key, png);
  return png;
}

/** Elevation in metres at (lon, lat), bilinear over the tile pixels. */
async function elevation(lon, lat) {
  const [xr, yr] = tileXY(lon, lat, Z);
  const px = xr * 256, py = yr * 256;           // global pixel coordinates
  const x0 = Math.floor(px - 0.5), y0 = Math.floor(py - 0.5);
  const fx = px - 0.5 - x0, fy = py - 0.5 - y0;

  const at = async (gx, gy) => {
    const tx = Math.floor(gx / 256), ty = Math.floor(gy / 256);
    const png = await tile(tx, ty);
    const i = ((gy - ty * 256) * 256 + (gx - tx * 256)) * 4;
    const d = png.data;
    return d[i] * 256 + d[i + 1] + d[i + 2] / 256 - 32768;
  };

  const h00 = await at(x0, y0), h10 = await at(x0 + 1, y0);
  const h01 = await at(x0, y0 + 1), h11 = await at(x0 + 1, y0 + 1);
  return h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy)
    + h01 * (1 - fx) * fy + h11 * fx * fy;
}

/* ------------------------------------------------------------- encode */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function varint(v, out) {
  let z = v < 0 ? -v * 2 - 1 : v * 2;
  while (z >= 32) { out.push(ALPHABET[(z & 31) | 32]); z = Math.floor(z / 32); }
  out.push(ALPHABET[z]);
}

/* ------------------------------------------------------- the boundary */

/**
 * Pull the US–Canada arc out of Natural Earth, in local km, and fit the two
 * legs. The meridian leg is trivially x = const; the tribunal segment is a
 * least-squares line through the points southeast of the turn.
 */
function boundary(nePath) {
  const topo = JSON.parse(readFileSync(nePath, 'utf8'));
  const { scale, translate } = topo.transform;
  let best = null;
  topo.arcs.forEach((arc, ai) => {
    let x = 0, y = 0; const pts = [];
    for (const [dx, dy] of arc) {
      x += dx; y += dy;
      pts.push([(x * scale[0] + translate[0] - LON0) * KX,
        (y * scale[1] + translate[1] - LAT0) * KY]);
    }
    const near = pts.filter(([ex, ny]) => Math.hypot(ex, ny) < 6);
    if (near.length && (!best || near.length > best.near.length)) best = { ai, pts, near };
  });
  if (!best) throw new Error('no boundary arc near the summit');

  const local = best.pts.filter(([ex, ny]) => ex > -35 && ex < 15 && ny > -33 && ny < 45);
  // The meridian leg: the x the polyline holds while running due north. Taken
  // from well north of the turn, where nothing but the meridian is left.
  const north = local.filter(([, ny]) => ny > 8);
  if (!north.length) throw new Error('no meridian points found north of the turn');
  const meridianX = north.reduce((s, p) => s + p[0], 0) / north.length;
  // The tribunal segment: everything east of the turn, fit by least squares.
  const seg = local.filter(([ex]) => ex > meridianX + 0.5);
  const n = seg.length;
  const sx = seg.reduce((s, p) => s + p[0], 0), sy = seg.reduce((s, p) => s + p[1], 0);
  const sxx = seg.reduce((s, p) => s + p[0] * p[0], 0), sxy = seg.reduce((s, p) => s + p[0] * p[1], 0);
  const m = (n * sxy - sx * sy) / (n * sxx - sx * sx);   // y = m x + b
  const b = (sy - m * sx) / n;
  return { meridianX, m, b, segPoints: seg };
}

/* --------------------------------------------------------------- main */

const nePath = process.argv[2];
if (!nePath) { console.error('usage: node tools/build-elias.mjs countries-10m.json'); process.exit(2); }

const bd = boundary(nePath);
console.log(`boundary: meridian leg at x = ${bd.meridianX.toFixed(3)} km;`
  + ` segment y = ${bd.m.toFixed(5)} x + ${bd.b.toFixed(4)} (${bd.segPoints.length} pts)`);
const summitSide = 0 - (bd.m * 0 + bd.b);
console.log(`summit sits ${Math.abs(summitSide).toFixed(3)} km ${summitSide > 0 ? 'north' : 'south'} of the segment`);

console.log(`fetching ${NX}x${NY} samples at z${Z}...`);
const heights = new Int32Array(NX * NY);
let peak = -Infinity, peakAt = null, low = Infinity;
for (let j = 0; j < NY; j++) {
  const lat = latOf(Y0 + j * STEP);
  for (let i = 0; i < NX; i++) {
    const h = await elevation(lonOf(X0 + i * STEP), lat);
    const q = Math.round(h);
    heights[j * NX + i] = q;
    if (q > peak) { peak = q; peakAt = [X0 + i * STEP, Y0 + j * STEP]; }
    if (q < low) low = q;
  }
  if (j % 40 === 0) console.log(`  row ${j}/${NY - 1}, tiles cached: ${cache.size}`);
}
console.log(`peak in grid: ${peak} m at (${peakAt[0].toFixed(2)}, ${peakAt[1].toFixed(2)}) km; lowest ${low} m`);

// Delta-encode in scan order.
const out = [];
let prev = 0;
for (let k = 0; k < heights.length; k++) { varint(heights[k] - prev, out); prev = heights[k]; }
const blob = out.join('');

// Split into lines the source file can carry comfortably.
const CHUNK = 4000;
const lines = [];
for (let i = 0; i < blob.length; i += CHUNK) lines.push(`'${blob.slice(i, i + CHUNK)}'`);

const module = `/**
 * elias-data.js — Mount Saint Elias, generated. Do not edit.
 *
 * A ${NX}x${NY} grid of elevations (whole metres) every ${STEP} km over
 * x in [${X0}, ${X1}] km east and y in [${Y0}, ${Y1}] km north of the summit
 * (60°17′32″N 140°55′53″W). Built by tools/build-elias.mjs from the AWS Open
 * Data terrain tiles (USGS 3DEP / Canada CDEM, public domain); highest sample
 * ${peak} m at (${peakAt[0].toFixed(2)}, ${peakAt[1].toFixed(2)}). Boundary fit from Natural Earth:
 * the 141°W meridian leg at x = ${bd.meridianX.toFixed(2)} km, and the 1903 tribunal segment
 * y = ${bd.m.toFixed(4)}·x ${bd.b < 0 ? '−' : '+'} ${Math.abs(bd.b).toFixed(4)}, with the summit ${Math.abs(summitSide).toFixed(2)} km on the
 * Canadian side of it. Same varint codec as worldmap-data.js.
 */

export const ELIAS = {
  nx: ${NX}, ny: ${NY},
  x0: ${X0}, y0: ${Y0}, step: ${STEP},
  peak: ${peak},
  boundary: { meridianX: ${bd.meridianX.toFixed(4)}, m: ${bd.m.toFixed(6)}, b: ${bd.b.toFixed(4)} },
  data: [
${lines.join(',\n')},
  ].join(''),
};
`;
writeFileSync(join(here, '../app/js/elias-data.js'), module);
console.log(`app/js/elias-data.js: ${(module.length / 1024).toFixed(0)} KB`);
