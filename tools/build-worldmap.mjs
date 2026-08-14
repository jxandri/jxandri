/**
 * build-worldmap.mjs — turn Natural Earth's coastlines into a module the app
 * can carry with it.
 *
 * The app has no network at run time: it is opened from a file, from a memory
 * stick, from a school laptop with the wifi off. So the world map cannot be
 * fetched, it has to be *in* the bundle, and it has to be small enough that
 * putting it there is not a decision anyone regrets.
 *
 * The source is world-atlas' TopoJSON of the land polygons — Natural Earth
 * data, public domain, packaged by Mike Bostock under ISC. TopoJSON is already
 * delta-encoded and quantised, but it also carries the topology machinery
 * (shared arcs, polygon assembly) that only matters if you intend to edit it.
 * We only ever draw it, so this flattens the arcs into plain closed rings of
 * longitude and latitude and re-encodes them:
 *
 *   * quantised to 1/100 degree — about a kilometre, and the texture it ends up
 *     in is 0.18 degrees per pixel, so the rounding is a fifth of a pixel;
 *   * delta-encoded along each ring, because consecutive coastline points are
 *     close together and their differences are small numbers;
 *   * zigzagged so negative differences stay small;
 *   * written as base-64 varints, five bits to a character.
 *
 * The result is one string per ring, a couple of characters per point.
 *
 *   node tools/build-worldmap.mjs [path/to/land-50m.json]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = process.argv[2];
if (!src) {
  console.error('usage: node tools/build-worldmap.mjs <land-50m.json>');
  process.exit(2);
}

const topo = JSON.parse(readFileSync(src, 'utf8'));
const { scale, translate } = topo.transform;

/** One TopoJSON arc, decoded to absolute [lon, lat] pairs. */
function arcPoints(i) {
  const raw = topo.arcs[i];
  const out = [];
  let x = 0, y = 0;
  for (const [dx, dy] of raw) {
    x += dx; y += dy;
    out.push([x * scale[0] + translate[0], y * scale[1] + translate[1]]);
  }
  return out;
}

/** A ring is a list of arc indices; a negative index means "that arc, backwards". */
function ringPoints(indices) {
  const out = [];
  for (const idx of indices) {
    const pts = idx < 0 ? arcPoints(~idx).slice().reverse() : arcPoints(idx);
    // Arcs share endpoints, so drop the duplicate where they join.
    for (let i = out.length ? 1 : 0; i < pts.length; i++) out.push(pts[i]);
  }
  return out;
}

const rings = [];
for (const geom of topo.objects.land.geometries) {
  const polys = geom.type === 'Polygon' ? [geom.arcs] : geom.arcs;
  for (const poly of polys) {
    // Outer ring and holes alike: a hole drawn on top of its own landmass with
    // the even-odd rule is exactly the Caspian Sea, and drawing it is right.
    for (const ring of poly) {
      const pts = ringPoints(ring);
      if (pts.length >= 4) rings.push(pts);
    }
  }
}

/* -------------------------------------------------------------- encoding */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function varint(v, out) {
  let z = v < 0 ? -v * 2 - 1 : v * 2;         // zigzag
  while (z >= 32) {
    out.push(ALPHABET[(z & 31) | 32]);
    z = Math.floor(z / 32);
  }
  out.push(ALPHABET[z]);
}

const Q = 100;                                 // hundredths of a degree
const encoded = [];
let points = 0;

for (const ring of rings) {
  const out = [];
  let px = 0, py = 0;
  for (const [lon, lat] of ring) {
    const x = Math.round(lon * Q);
    const y = Math.round(lat * Q);
    varint(x - px, out);
    varint(y - py, out);
    px = x; py = y;
    points++;
  }
  encoded.push(out.join(''));
}

const body = encoded.map((s) => `'${s}'`).join(',\n');
const module = `/**
 * worldmap-data.js — the coastlines of the Earth, generated. Do not edit.
 *
 * Built by tools/build-worldmap.mjs from world-atlas' TopoJSON of Natural
 * Earth's land polygons: public-domain data, ISC-licensed packaging
 * (Copyright 2013-2019 Michael Bostock). ${rings.length} closed rings,
 * ${points} points, quantised to 1/100 degree and delta-encoded as base-64
 * varints — see the build script for the format and the decoder in
 * worldmap.js for how to read it back.
 */

export const RINGS = [
${body},
];
`;

const dest = join(here, '../app/js/worldmap-data.js');
writeFileSync(dest, module);
console.log(`${rings.length} rings, ${points} points -> ${(module.length / 1024).toFixed(0)} KB`);
