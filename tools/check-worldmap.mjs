/**
 * check-worldmap.mjs — the map in the bundle really is the Earth, and it lands
 * on the surface where it should.
 *
 * The coastlines went through a lossy-looking pipeline — TopoJSON, flattened,
 * quantised, zigzagged, base-64 varints — and the only test worth running on
 * the far end of that is geography. Ray-cast a few places against the decoded
 * rings and ask whether they are land or sea. If London is in the Atlantic,
 * something in the codec is wrong, and no amount of "it decodes without
 * throwing" would have caught it.
 *
 *   node tools/check-worldmap.mjs
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const THREE = await import(join(here, '../app/vendor/three.module.js'));
const { RINGS } = await import(join(here, '../app/js/worldmap-data.js'));
const { mapUV, __test } = await import(join(here, '../app/js/worldmap.js'));

let fails = 0;
const check = (n, ok, d) => { if (!ok) fails++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`); };

const rings = RINGS.map(__test.decodeRing);

/* ------------------------------------------------------------- the data */

let points = 0, worstLon = 0, worstLat = 0, closed = 0;
for (const r of rings) {
  points += r.length / 2;
  for (let i = 0; i < r.length; i += 2) {
    worstLon = Math.max(worstLon, Math.abs(r[i]));
    worstLat = Math.max(worstLat, Math.abs(r[i + 1]));
  }
  const n = r.length;
  if (Math.abs(r[0] - r[n - 2]) < 0.02 && Math.abs(r[1] - r[n - 1]) < 0.02) closed++;
}

check('every ring decodes', rings.length === RINGS.length && rings.every((r) => r.length >= 8),
  `${rings.length} rings, ${points} points`);
check('and lands inside the world',
  worstLon <= 180.01 && worstLat <= 90.01,
  `|lon| ≤ ${worstLon.toFixed(2)}, |lat| ≤ ${worstLat.toFixed(2)}`);
check('and closes on itself', closed > rings.length * 0.95,
  `${closed} of ${rings.length} rings closed`);

/* ---------------------------------------------------------- the geography */

/**
 * Even-odd, over every ring at once: a point is land when a ray east of it
 * crosses the coastline an odd number of times. Holes come out as sea for
 * free, which is what a hole in a land polygon is.
 */
function isLand(lon, lat) {
  let inside = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1];
      if ((yi > lat) !== (yj > lat)
        && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

const PLACES = [
  ['Madrid', -3.7, 40.4, true],
  ['Paris', 2.35, 48.86, true],
  ['the middle of the Sahara', 10, 25, true],
  ['central Siberia', 100, 62, true],
  ['central Australia', 133, -25, true],
  ['the Amazon basin', -60, -5, true],
  ['the middle of the Pacific', -140, 0, false],
  ['the middle of the Atlantic', -30, 10, false],
  ['the middle of the Indian Ocean', 75, -30, false],
  ['the Southern Ocean', 0, -60, false],
];

let wrong = 0;
for (const [name, lon, lat, land] of PLACES) {
  if (isLand(lon, lat) !== land) { wrong++; console.log(`     ${name} came out as ${land ? 'sea' : 'land'}`); }
}
check('the continents are where the continents are',
  wrong === 0, `${PLACES.length - wrong} of ${PLACES.length} places right`);

/* ------------------------------------------------------ where it is laid */

{
  // A parametric sphere in the usual (u, v): u is longitude, v is colatitude.
  // The map has to arrive the right way up — north at the top — and cover the
  // whole picture exactly once.
  const w = 5;
  const geom = new THREE.BufferGeometry();
  const pos = new Float32Array(w * w * 3);
  const uv = new Float32Array(w * w * 2);
  for (let j = 0; j < w; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      const u = (2 * Math.PI * i) / (w - 1);
      const v = (Math.PI * j) / (w - 1);
      pos[k * 3] = Math.cos(u) * Math.sin(v);
      pos[k * 3 + 1] = Math.cos(v);
      pos[k * 3 + 2] = -Math.sin(u) * Math.sin(v);
      uv[k * 2] = u; uv[k * 2 + 1] = v;
    }
  }
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const mesh = new THREE.Mesh(geom);

  check('the map lays onto a parametric patch',
    mapUV(mesh, 'parametric', { umin: 0, umax: 2 * Math.PI, vmin: 0, vmax: Math.PI }));

  const out = mesh.geometry.getAttribute('uv');
  let lo = Infinity, hi = -Infinity, northY = null, southY = null;
  for (let k = 0; k < w * w; k++) {
    lo = Math.min(lo, out.getX(k), out.getY(k));
    hi = Math.max(hi, out.getX(k), out.getY(k));
    if (pos[k * 3 + 1] > 0.999) northY = out.getY(k);
    if (pos[k * 3 + 1] < -0.999) southY = out.getY(k);
  }
  // Stored as float32, so the floor is float32's precision, not the arithmetic's.
  check('covering the whole map exactly once',
    Math.abs(lo) < 1e-6 && Math.abs(hi - 1) < 1e-6,
    `[${lo.toExponential(1)}, ${hi.toFixed(6)}]`);
  // The texture is not flipped by three.js at sample time for a CanvasTexture
  // with flipY on, so v = 1 is the top row of the drawing: the north.
  check('with the north pole at the top of the picture',
    Math.abs(northY - 1) < 1e-6 && Math.abs(southY) < 1e-6,
    `north ${northY.toFixed(6)}, south ${southY.toExponential(1)}`);
}

{
  // An implicit surface has no rectangle, so it gets longitude and latitude
  // about its own centre — and a triangle straddling the date line must not
  // drag the whole map across itself.
  const geom = new THREE.BufferGeometry();
  // One triangle just east of −180 and one just west of +180, sharing nothing.
  const p = [];
  const at = (lon, lat) => {
    const a = (lon * Math.PI) / 180, b = (lat * Math.PI) / 180;
    return [Math.cos(b) * Math.cos(a), Math.sin(b), Math.cos(b) * Math.sin(a)];
  };
  p.push(...at(179, 0), ...at(-179, 0), ...at(179, 5));
  p.push(...at(10, 0), ...at(12, 0), ...at(10, 5));
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(p), 3));
  const mesh = new THREE.Mesh(geom);
  mapUV(mesh, 'implicit', { centre: new THREE.Vector3() });
  const uv = mesh.geometry.getAttribute('uv');

  const span = (t) => {
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < 3; k++) { lo = Math.min(lo, uv.getX(t * 3 + k)); hi = Math.max(hi, uv.getX(t * 3 + k)); }
    return hi - lo;
  };
  check('the date line does not smear a triangle across the world',
    span(0) < 0.05, `the straddling triangle spans ${(span(0) * 360).toFixed(1)}° of the map`);
  check('and an ordinary triangle is left alone',
    span(1) < 0.05, `${(span(1) * 360).toFixed(1)}°`);
}

console.log(fails === 0 ? '\nTHE MAP IS THE EARTH, AND IT LANDS SQUARE' : `\n${fails} FAILURE(S)`);
process.exit(fails ? 1 : 0);
