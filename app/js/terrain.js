/**
 * terrain.js — turns a sampled field into meshes.
 *
 * The surface itself stays exactly as smooth as f is: it is a plain triangulated
 * graph of z = f(x,y) with analytic vertex normals. Everything rugged (trees,
 * rocks, grass) is a separate object placed *on top* of it by decor.js, so from
 * a distance the mountain reads as the smooth surface it really is.
 *
 * One BufferGeometry carries the whole surface, split into two draw groups:
 * group 0 = triangles inside the feasible set, group 1 = everything else. That
 * makes "make the rest translucent" a material swap rather than a rebuild.
 */

import * as THREE from '../vendor/three.module.js';

export const GROUP_INSIDE = 0;
export const GROUP_OUTSIDE = 1;

/* ------------------------------------------------------------- colouring */

/* ------------------------------------------------------------------ noise */

/**
 * Coherent value noise, sampled in world metres.
 *
 * Sampling in *world space* rather than per grid index is what makes the
 * colouring hold together: the main mesh and the detail patches disagree about
 * indices but agree about position, so they produce identical colours and the
 * seam between them disappears. It is also smooth by construction, where a
 * per-vertex hash produced visible static as soon as you stood close enough to
 * resolve individual vertices.
 */
function nhash(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Quintic fade: continuous first derivative, so no creases along cell edges.
function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

function valueNoise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const ux = fade(x - ix), uy = fade(y - iy);
  const a = nhash(ix, iy, seed), b = nhash(ix + 1, iy, seed);
  const c = nhash(ix, iy + 1, seed), d = nhash(ix + 1, iy + 1, seed);
  const top = a + (b - a) * ux;
  const bot = c + (d - c) * ux;
  return top + (bot - top) * uy;
}

/**
 * Fractal noise in [0,1]. `scale` is the size of the largest feature in metres.
 *
 * Octave count is explicit because the finest octave has to stay comfortably
 * larger than the mesh spacing — detail finer than the triangles carrying it
 * aliases straight back into the per-vertex speckle this replaced.
 */
function fbm(wx, wz, scale, seed, octaves) {
  let f = 1 / scale, amp = 1, sum = 0, norm = 0;
  const n = octaves || 3;
  for (let o = 0; o < n; o++) {
    sum += amp * valueNoise(wx * f, wz * f, seed + o * 101);
    norm += amp;
    amp *= 0.5;
    f *= 2.13; // irrational-ish, to avoid octaves lining up into a grid
  }
  return sum / norm;
}

function smoothstep(a, b, t) {
  const u = Math.min(1, Math.max(0, (t - a) / (b - a || 1e-9)));
  return u * u * (3 - 2 * u);
}

function mix(a, b, t) { return a + (b - a) * t; }

function mixRGB(c1, c2, t, out) {
  out[0] = mix(c1[0], c2[0], t);
  out[1] = mix(c1[1], c2[1], t);
  out[2] = mix(c1[2], c2[2], t);
  return out;
}

/**
 * The height ramp: ten colours, interpolated continuously by normalised
 * height. This is the palette a heat map or a physical relief map uses, and it
 * drives both the contour paths and — when the height-colour toggle is on —
 * the whole surface, so the two always agree.
 */
const HEIGHT_RAMP = [
  [0.000, 0.427, 0.173],  // (0,109,44)     deepest
  [0.192, 0.639, 0.329],  // (49,163,84)
  [0.455, 0.769, 0.463],  // (116,196,118)
  [0.729, 0.894, 0.702],  // (186,228,179)
  [0.929, 0.973, 0.914],  // (237,248,233)
  [1.000, 1.000, 0.698],  // (255,255,178)
  [0.996, 0.800, 0.361],  // (254,204,92)
  [0.992, 0.553, 0.235],  // (253,141,60)
  [0.941, 0.231, 0.125],  // (240,59,32)
  [0.741, 0.000, 0.149],  // (189,0,38)     highest
];

/** Continuous interpolation along HEIGHT_RAMP. `h` is normalised height. */
export function heightColor(h, out) {
  const t = Math.min(1, Math.max(0, h)) * (HEIGHT_RAMP.length - 1);
  const i = Math.min(HEIGHT_RAMP.length - 2, Math.floor(t));
  return mixRGB(HEIGHT_RAMP[i], HEIGHT_RAMP[i + 1], t - i, out);
}

// Realistic terrain ramp, keyed on normalised height. Deliberately bright:
// these are albedos, and a muddy albedo under a soft sky reads as grey mush.
const SILT = [0.46, 0.41, 0.31];
const SAND = [0.90, 0.84, 0.60];
const GRASS = [0.47, 0.76, 0.28];
const GRASS_DRY = [0.79, 0.74, 0.33];   // sun-bleached meadow
const GRASS_COOL = [0.33, 0.63, 0.41];  // damp, blue-green pasture
const FOREST = [0.31, 0.58, 0.24];
const FOREST_DEEP = [0.20, 0.40, 0.19];
const SCREE = [0.74, 0.71, 0.66];
const SNOW = [0.99, 0.99, 1.00];

// Three rock families. Which one you are standing on varies over tens of
// metres, which is most of what makes high ground look like anything at all.
const ROCK_COOL = [0.62, 0.62, 0.64];   // grey granite
const ROCK_WARM = [0.72, 0.58, 0.44];   // ochre sandstone
const ROCK_DARK = [0.38, 0.36, 0.39];   // dark basalt
const LICHEN = [0.58, 0.65, 0.40];

const ROCK_TMP = [0, 0, 0];

/**
 * The rock colour at a point: two families blended over a long wavelength, a
 * darker mineral in patches, and faint strata banding on the harsher ground.
 */
function rockTint(macro, meso, h, rugged, out) {
  mixRGB(ROCK_COOL, ROCK_WARM, smoothstep(0.30, 0.78, macro), out);
  mixRGB(out, ROCK_DARK, smoothstep(0.58, 0.95, meso) * 0.60, out);

  // Horizontal bands, as if bedding planes were exposed by the slope.
  const strata = 0.5 + 0.5 * Math.sin(h * 52 + macro * 7.0);
  const k = 1 + (strata - 0.5) * 0.20 * rugged;
  out[0] *= k; out[1] *= k; out[2] *= k;
  return out;
}

/**
 * Biome colour for a surface point.
 *
 * @param h      normalised height in [0,1]
 * @param z      raw height (so the waterline at z = 0 means something)
 * @param slope  |grad f| divided by the surface's median slope (1 = typical)
 * @param wx,wz  world position in metres, used to sample the noise fields
 */
export function biomeColor(h, z, slope, wx, wz, out) {
  // Four scales, because terrain varies at all of them. Without the finest one
  // a hillside seen from eye level spans less than a single noise feature and
  // reads as one flat wash of colour.
  const macro = fbm(wx, wz, 62, 17);        // which soil / rock: tens of metres
  const meso = fbm(wx, wz, 15, 91);         // mottling within it
  const veg = fbm(wx, wz, 31, 211);         // meadow / woodland patchiness
  const fine = fbm(wx, wz, 7, 331, 2);      // ground texture at walking range

  const steep = smoothstep(1.35, 3.2, slope);

  // How harsh this ground is: steep and high is tough, low and flat is gentle.
  // Everything below scales its variation by this, so meadows stay calm while
  // the summits break up into patches of different stone.
  const rugged = Math.min(1, 0.60 * smoothstep(0.70, 2.60, slope)
                           + 0.40 * smoothstep(0.45, 0.95, h));

  // Let the biome boundaries wander instead of tracking the level curves
  // exactly — nothing in nature changes colour along a contour, and a band that
  // does is the giveaway that you are looking at a plot rather than a place.
  const t = h + (macro - 0.5) * 0.13 + (meso - 0.5) * 0.05;

  if (z < 0) {
    // Lake bed: silt, drying to sand near the shoreline.
    mixRGB(SILT, SAND, 0.25 + macro * 0.45, out);
  } else if (t < 0.26) {
    mixRGB(SAND, GRASS, smoothstep(0.0, 0.12, t), out);
    mixRGB(out, GRASS_DRY, smoothstep(0.30, 0.78, veg) * 0.55, out);
  } else if (t < 0.62) {
    mixRGB(GRASS, FOREST, smoothstep(0.24, 0.74, t), out);
    // Meadows and clearings run dry and strawy; the hollows between them hold
    // darker, denser growth.
    mixRGB(out, GRASS_DRY, smoothstep(0.34, 0.80, veg) * 0.52, out);
    mixRGB(out, GRASS_COOL, smoothstep(0.62, 0.20, veg) * 0.42, out);
    mixRGB(out, FOREST_DEEP, smoothstep(0.52, 0.92, meso) * 0.45, out);
    // Scrub and bare earth showing through at close range.
    mixRGB(out, GRASS_DRY, smoothstep(0.58, 0.95, fine) * 0.26, out);
  } else if (t < 0.80) {
    mixRGB(FOREST, rockTint(macro, meso, h, rugged, ROCK_TMP), smoothstep(0.62, 0.80, t), out);
  } else if (t < 0.90) {
    mixRGB(rockTint(macro, meso, h, rugged, ROCK_TMP), SCREE, smoothstep(0.80, 0.90, t), out);
  } else {
    mixRGB(SCREE, SNOW, smoothstep(0.87, 0.97, t), out);
  }

  // Steep ground sheds soil and snow: push it toward bare rock.
  if (steep > 0.001) {
    mixRGB(out, rockTint(macro, meso, h, rugged, ROCK_TMP), steep * 0.78, out);
  }

  // Lichen and moss colonise the gentler rock faces.
  const lichen = smoothstep(0.62, 0.92, meso) * (1 - steep * 0.6) * rugged * 0.30;
  if (lichen > 0.001) mixRGB(out, LICHEN, lichen, out);

  // Snow lies in patches, and only where it can settle. Displacing the snow
  // line by noise keeps the cap from being a clean band around the peak.
  const snow = smoothstep(0.86, 1.00, t - steep * 0.12 + (meso - 0.5) * 0.10);
  if (snow > 0.001) mixRGB(out, SNOW, snow, out);

  // Finally, brightness variation. Gentle ground still breathes a little; tough
  // ground swings hard, which is what stops a summit reading as one grey slab.
  const amp = 0.13 + 0.34 * rugged;
  const swing = (fine - 0.5) * 0.40 + (meso - 0.5) * 0.35 + (macro - 0.5) * 0.25;
  const shade = 1 + swing * 2 * amp;
  out[0] *= shade; out[1] *= shade; out[2] *= shade;
  return out;
}

/* --------------------------------------------------------- surface build */

/**
 * Build the main surface mesh from a FieldGrid.
 * Returns { mesh, geometry, materials, stats } — stats reports how much of the
 * domain was undefined (NaN), which the UI surfaces to the student.
 */
export function buildSurface(field, grid, predicate) {
  const { n, w } = grid;
  const vcount = w * w;

  const positions = new Float32Array(vcount * 3);
  const normals = new Float32Array(vcount * 3);
  const colors = new Float32Array(vcount * 3);

  const nrm = new THREE.Vector3();
  const rgb = [0, 0, 0];
  const grad = [0, 0];

  for (let j = 0; j <= n; j++) {
    const yy = grid.y(j);
    for (let i = 0; i <= n; i++) {
      const k = j * w + i;
      const xx = grid.x(i);
      const z = grid.valid[k] ? grid.z[k] : 0;

      const px = field.worldX(xx), pz = field.worldZ(yy);
      positions[k * 3] = px;
      positions[k * 3 + 1] = field.worldY(z);
      positions[k * 3 + 2] = pz;

      // One gradient per vertex, reused for both the normal and the slope.
      grid.gradientAt(i, j, grad);
      field.normalFromGrad(grad[0], grad[1], nrm);
      normals[k * 3] = nrm.x; normals[k * 3 + 1] = nrm.y; normals[k * 3 + 2] = nrm.z;

      const slope = isFinite(grad[0]) && isFinite(grad[1])
        ? Math.hypot(grad[0], grad[1]) / grid.slopeRef : 0;
      biomeColor(grid.norm(z), z, slope, px, pz, rgb);
      colors[k * 3] = rgb[0]; colors[k * 3 + 1] = rgb[1]; colors[k * 3 + 2] = rgb[2];
    }
  }

  // Triangulate, dropping any cell that touches an undefined sample, and
  // sorting each cell into the inside / outside group.
  const inside = [];
  const outside = [];
  let cellsTotal = 0, cellsDropped = 0;

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      cellsTotal++;
      const a = j * w + i, b = j * w + i + 1, c = (j + 1) * w + i, d = (j + 1) * w + i + 1;
      if (!(grid.valid[a] && grid.valid[b] && grid.valid[c] && grid.valid[d])) { cellsDropped++; continue; }

      const cxm = (grid.x(i) + grid.x(i + 1)) / 2;
      const cym = (grid.y(j) + grid.y(j + 1)) / 2;
      const target = predicate(cxm, cym) ? inside : outside;

      // Winding chosen so the surface faces up in world space.
      target.push(a, c, b, b, c, d);
    }
  }

  const index = new Uint32Array(inside.length + outside.length);
  index.set(inside, 0);
  index.set(outside, inside.length);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.addGroup(0, inside.length, GROUP_INSIDE);
  geometry.addGroup(inside.length, outside.length, GROUP_OUTSIDE);
  geometry.computeBoundingSphere();

  const matInside = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.95, metalness: 0.0, side: THREE.DoubleSide,
  });
  const matOutside = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.95, metalness: 0.0, side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, [matInside, matOutside]);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.name = 'surface';

  return {
    mesh,
    geometry,
    materials: [matInside, matOutside],
    stats: {
      cellsTotal,
      cellsDropped,
      insideTris: inside.length / 3,
      outsideTris: outside.length / 3,
      undefinedFraction: cellsTotal ? cellsDropped / cellsTotal : 0,
    },
  };
}

/** Recolour an existing surface in place (topographic <-> realistic). */
export function recolorSurface(field, grid, geometry, palette) {
  const colors = geometry.getAttribute('color');
  const arr = colors.array;
  const { n, w } = grid;
  const rgb = [0, 0, 0];
  const grad = [0, 0];

  for (let j = 0; j <= n; j++) {
    const yy = grid.y(j);
    for (let i = 0; i <= n; i++) {
      const k = j * w + i;
      const z = grid.valid[k] ? grid.z[k] : 0;
      if (palette === 'height') {
        heightColor(grid.norm(z), rgb);
      } else {
        grid.gradientAt(i, j, grad);
        const slope = isFinite(grad[0]) && isFinite(grad[1])
          ? Math.hypot(grad[0], grad[1]) / grid.slopeRef : 0;
        biomeColor(grid.norm(z), z, slope, field.worldX(grid.x(i)), field.worldZ(yy), rgb);
      }
      arr[k * 3] = rgb[0]; arr[k * 3 + 1] = rgb[1]; arr[k * 3 + 2] = rgb[2];
    }
  }
  colors.needsUpdate = true;
}

/* ------------------------------------------------------------------ water */

/**
 * A translucent sheet at z = 0 filling every depression. Only built when the
 * function actually goes below zero.
 */
export function buildWater(field, grid) {
  if (grid.zmin >= 0) return null;

  const geom = new THREE.PlaneGeometry(
    (field.xmax - field.xmin) * field.S,
    (field.ymax - field.ymin) * field.S,
    1, 1,
  );
  geom.rotateX(-Math.PI / 2);

  const mat = new THREE.MeshStandardMaterial({
    color: 0x2e6f9e,
    transparent: true,
    opacity: 0.62,
    roughness: 0.12,
    metalness: 0.25,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(field.worldX(field.cx), field.worldY(0), field.worldZ(field.cy));
  mesh.renderOrder = 1;
  mesh.name = 'water';
  return mesh;
}

/* ---------------------------------------------------- feasible-set walls */

/**
 * Bright walls standing on the boundary of the feasible set — "the frontiers of
 * the country". Built by walking the sample grid and emitting a quad wherever
 * two neighbouring cells disagree about membership.
 */
export function buildFeasibleWalls(field, grid, predicate, heightMetres) {
  const { n, w } = grid;
  const wallH = heightMetres ?? field.worldSize * 0.042;

  const cellIn = new Uint8Array(n * n);
  const cellOk = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * w + i, b = j * w + i + 1, c = (j + 1) * w + i, d = (j + 1) * w + i + 1;
      const ok = grid.valid[a] && grid.valid[b] && grid.valid[c] && grid.valid[d];
      cellOk[j * n + i] = ok ? 1 : 0;
      cellIn[j * n + i] = ok && predicate((grid.x(i) + grid.x(i + 1)) / 2, (grid.y(j) + grid.y(j + 1)) / 2) ? 1 : 0;
    }
  }

  const pos = [];
  const col = [];
  const idx = [];
  const base = new THREE.Color(0x59f7d6);
  const top = new THREE.Color(0xeafffb);

  const pushEdge = (i0, j0, i1, j1) => {
    // Two grid corners define the foot of the wall; extrude straight up.
    const k0 = j0 * w + i0, k1 = j1 * w + i1;
    if (!grid.valid[k0] || !grid.valid[k1]) return;

    const x0 = field.worldX(grid.x(i0)), z0 = field.worldZ(grid.y(j0)), y0 = field.worldY(grid.z[k0]);
    const x1 = field.worldX(grid.x(i1)), z1 = field.worldZ(grid.y(j1)), y1 = field.worldY(grid.z[k1]);

    const v = pos.length / 3;
    pos.push(x0, y0, z0, x1, y1, z1, x1, y1 + wallH, z1, x0, y0 + wallH, z0);
    col.push(base.r, base.g, base.b, base.r, base.g, base.b, top.r, top.g, top.b, top.r, top.g, top.b);
    idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
  };

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const here = cellIn[j * n + i];
      if (!here) continue;

      const left = i > 0 ? cellIn[j * n + i - 1] : 0;
      const right = i < n - 1 ? cellIn[j * n + i + 1] : 0;
      const down = j > 0 ? cellIn[(j - 1) * n + i] : 0;
      const up = j < n - 1 ? cellIn[(j + 1) * n + i] : 0;

      if (!left) pushEdge(i, j, i, j + 1);
      if (!right) pushEdge(i + 1, j, i + 1, j + 1);
      if (!down) pushEdge(i, j, i + 1, j);
      if (!up) pushEdge(i, j + 1, i + 1, j + 1);
    }
  }

  if (idx.length === 0) return null;

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geom.setIndex(idx);
  geom.computeBoundingSphere();

  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    // Additive, so standing inside a wall should not white out the screen.
    opacity: 0.42,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: false,
  });

  const mesh = new THREE.Mesh(geom, mat);
  mesh.renderOrder = 3;
  mesh.name = 'feasible-walls';
  return mesh;
}

/* ------------------------------------------------------------ local patch */

/**
 * Nested, finely-sampled sheets that follow the player.
 *
 * Two jobs. First, close-range smoothness: the global mesh is sized to cover the
 * whole domain, so at eye level its cells are metres across and the ground reads
 * as facets. These rings re-sample f around the explorer at a spacing measured
 * in centimetres, and each successive ring is a few times wider and proportionally
 * coarser, which buys detail underfoot and coverage out to the middle distance
 * for a fixed vertex budget.
 *
 * Second, the zoom demonstration: without them, shrinking the character to 10^-4
 * would park them on one enormous flat triangle and the surface would look
 * linear for entirely the wrong reason. The rings re-sample at the current zoom,
 * so what flattens out is the actual function.
 */
export class SurfaceDetail {
  /**
   * @param rings     how many nested squares; each is `growth` times wider than
   *                  the last, so a fixed vertex budget buys detail where the
   *                  eye is and coverage where it is not
   * @param segments  grid resolution of every ring
   */
  constructor(field, options) {
    const o = options || {};
    this.field = field;
    this.seg = o.segments ?? 96;
    this.growth = o.growth ?? 3.4;
    this.extent = 0;
    this.topographic = false;

    this.group = new THREE.Group();
    this.group.name = 'surface-detail';
    this.rings = [];

    const count = o.rings ?? 2;
    for (let r = 0; r < count; r++) this.rings.push(this._makeRing(r, count));
    for (const ring of this.rings) this.group.add(ring.mesh);
  }

  _makeRing(index, count) {
    const seg = this.seg;
    const w = seg + 1;

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(w * w * 3), 3));
    geom.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(w * w * 3), 3));
    geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(w * w * 3), 3));

    const idx = [];
    for (let j = 0; j < seg; j++) {
      for (let i = 0; i < seg; i++) {
        const a = j * w + i, b = j * w + i + 1, c = (j + 1) * w + i, d = (j + 1) * w + i + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    geom.setIndex(idx);

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0.0,
      side: THREE.DoubleSide,
      polygonOffset: true,
      // Finer rings win over coarser ones and over the main mesh.
      polygonOffsetFactor: -4 * (count - index),
      polygonOffsetUnits: -8 * (count - index),
    });

    const mesh = new THREE.Mesh(geom, material);
    mesh.name = `surface-detail-${index}`;
    mesh.frustumCulled = false;
    mesh.visible = false;
    // Innermost ring draws last, so it is the one you see underfoot.
    mesh.renderOrder = index;

    return {
      index,
      mesh,
      geometry: geom,
      material,
      z: new Float32Array(w * w),
      extent: 0,
      cx: NaN,
      cy: NaN,
    };
  }

  /**
   * @param baseExtent half-width of the innermost ring, in math units
   */
  update(cx, cy, baseExtent, grid, topographic, force) {
    const paletteChanged = topographic !== this.topographic;
    this.topographic = topographic;
    this.extent = baseExtent;

    for (const ring of this.rings) {
      const extent = baseExtent * Math.pow(this.growth, ring.index);
      // Each ring only rebuilds on its own terms: the small one follows every
      // few steps, the large one hardly ever.
      const moved = !isFinite(ring.cx) || Math.hypot(cx - ring.cx, cy - ring.cy) > extent * 0.22;
      const resized = Math.abs(extent - ring.extent) > extent * 1e-3;
      if (force || moved || resized || paletteChanged) {
        this._buildRing(ring, cx, cy, extent, grid, topographic);
      }
    }
  }

  _buildRing(ring, cx, cy, extent, grid, topographic) {
    ring.cx = cx; ring.cy = cy; ring.extent = extent;

    const field = this.field;
    const seg = this.seg;
    const w = seg + 1;
    const step = (2 * extent) / seg;

    const pos = ring.geometry.getAttribute('position');
    const nor = ring.geometry.getAttribute('normal');
    const colAttr = ring.geometry.getAttribute('color');
    const P = pos.array, N = nor.array, C = colAttr.array;
    const Z = ring.z;

    // Pass 1: sample f once per vertex.
    let anyValid = false;
    for (let j = 0; j < w; j++) {
      const yy = cy + (j - seg / 2) * step;
      for (let i = 0; i < w; i++) {
        const xx = cx + (i - seg / 2) * step;
        const z = field.height(xx, yy);
        if (isFinite(z)) { Z[j * w + i] = z; anyValid = true; }
        else Z[j * w + i] = NaN;
      }
    }

    // Pass 2: positions, normals and colours, with gradients differenced from
    // the samples above rather than costing four more evaluations each.
    const nrm = new THREE.Vector3();
    const rgb = [0, 0, 0];

    for (let j = 0; j < w; j++) {
      const yy = cy + (j - seg / 2) * step;
      for (let i = 0; i < w; i++) {
        const k = j * w + i;
        const xx = cx + (i - seg / 2) * step;
        const raw = Z[k];
        const zz = isFinite(raw) ? raw : 0;

        const px = field.worldX(xx), pz = field.worldZ(yy);
        P[k * 3] = px;
        P[k * 3 + 1] = field.worldY(zz);
        P[k * 3 + 2] = pz;

        let gx, gy;
        const l = i > 0 && isFinite(Z[k - 1]), r = i < seg && isFinite(Z[k + 1]);
        if (l && r) gx = (Z[k + 1] - Z[k - 1]) / (2 * step);
        else if (r) gx = (Z[k + 1] - zz) / step;
        else if (l) gx = (zz - Z[k - 1]) / step;

        const d = j > 0 && isFinite(Z[k - w]), u = j < seg && isFinite(Z[k + w]);
        if (d && u) gy = (Z[k + w] - Z[k - w]) / (2 * step);
        else if (u) gy = (Z[k + w] - zz) / step;
        else if (d) gy = (zz - Z[k - w]) / step;

        if (!isFinite(gx) || !isFinite(gy)) {
          const g = field.gradient(xx, yy, step * 0.5);
          gx = g[0]; gy = g[1];
        }

        field.normalFromGrad(gx, gy, nrm);
        N[k * 3] = nrm.x; N[k * 3 + 1] = nrm.y; N[k * 3 + 2] = nrm.z;

        if (topographic === 'height') {
          heightColor(grid.norm(zz), rgb);
        } else {
          const slope = isFinite(gx) && isFinite(gy) ? Math.hypot(gx, gy) / grid.slopeRef : 0;
          biomeColor(grid.norm(zz), zz, slope, px, pz, rgb);
        }
        C[k * 3] = rgb[0]; C[k * 3 + 1] = rgb[1]; C[k * 3 + 2] = rgb[2];
      }
    }

    pos.needsUpdate = true;
    nor.needsUpdate = true;
    colAttr.needsUpdate = true;
    ring.geometry.computeBoundingSphere();
    ring.mesh.visible = anyValid;

    // Float the ring just clear of what it covers.
    //
    // Depth-buffer tricks alone are not enough: the surfaces differ by real
    // geometry, and the chord error of a coarse cell can be centimetres. Once
    // the explorer is a fraction of a millimetre tall, centimetres is a chasm
    // and the coarser triangles would swallow the ring. So measure the gap.
    let gap = 0;
    const probes = [[0, 0], [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]];
    for (const [dx, dy] of probes) {
      const sx = cx + dx * extent, sy = cy + dy * extent;
      const coarse = grid.meshHeight(sx, sy);
      const exact = field.height(sx, sy);
      if (isFinite(coarse) && isFinite(exact)) gap = Math.max(gap, coarse - exact);
    }
    // Separation is measured against the ring's own size, never against the
    // world. An absolute epsilon is invisible at 1:1 and catastrophic at
    // 1:10000, where it would stand taller than the explorer and bury them.
    const worldExtent = extent * field.S;
    const rank = this.rings.length - ring.index;
    ring.mesh.position.y = field.worldY(gap) + worldExtent * 0.0009 * (1 + rank);
  }

  dispose() {
    for (const ring of this.rings) {
      ring.geometry.dispose();
      ring.material.dispose();
    }
    this.rings = [];
  }
}
