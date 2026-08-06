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

function hash2(i, j) {
  let h = i * 374761393 + j * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
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

// Realistic terrain ramp, keyed on normalised height.
const SILT = [0.34, 0.30, 0.24];
const SAND = [0.72, 0.67, 0.48];
const GRASS = [0.33, 0.52, 0.21];
const FOREST = [0.21, 0.37, 0.16];
const ROCK = [0.44, 0.41, 0.38];
const SCREE = [0.55, 0.52, 0.48];
const SNOW = [0.96, 0.97, 1.00];

/**
 * Biome colour for a surface point.
 * @param h  normalised height in [0,1]
 * @param z  raw height (so water level z=0 means something)
 * @param slope |grad f| divided by the surface's median slope (so 1 = typical)
 * @param n  noise in [0,1] for per-patch variation
 */
export function biomeColor(h, z, slope, n, out) {
  const steep = smoothstep(1.35, 3.2, slope);

  if (z < 0) {
    // Lake / canyon floor: silt, drying to sand near the shoreline.
    const shore = smoothstep(-0.06, 0.0, h * 0 + z / 1 || 0);
    mixRGB(SILT, SAND, shore * 0.6, out);
  } else {
    const t = h;
    if (t < 0.26) mixRGB(SAND, GRASS, smoothstep(0.0, 0.12, t), out);
    else if (t < 0.62) mixRGB(GRASS, FOREST, smoothstep(0.26, 0.62, t), out);
    else if (t < 0.79) mixRGB(FOREST, ROCK, smoothstep(0.62, 0.79, t), out);
    else if (t < 0.89) mixRGB(ROCK, SCREE, smoothstep(0.79, 0.89, t), out);
    else mixRGB(SCREE, SNOW, smoothstep(0.86, 0.96, t), out);
  }

  // Steep ground sheds soil and snow: push it toward bare rock.
  mixRGB(out, ROCK, steep * 0.75, out);

  const jitter = 0.90 + 0.20 * n;
  out[0] *= jitter; out[1] *= jitter; out[2] *= jitter;
  return out;
}

// Hypsometric tints, the palette paper topographic maps use.
const TOPO_STOPS = [
  [0.00, [0.10, 0.22, 0.45]], // deep water
  [0.16, [0.28, 0.55, 0.75]], // shallow water
  [0.25, [0.55, 0.76, 0.60]],
  [0.38, [0.72, 0.82, 0.52]], // lowland green
  [0.50, [0.92, 0.88, 0.58]], // yellow
  [0.62, [0.88, 0.74, 0.44]],
  [0.74, [0.76, 0.55, 0.36]], // tan
  [0.86, [0.62, 0.42, 0.34]], // brown
  [0.94, [0.80, 0.76, 0.75]],
  [1.00, [1.00, 1.00, 1.00]], // snow / summit
];

/** Topographic colour. `wet` is the fraction of the range that is below z=0. */
export function topoColor(h, wet, out) {
  // Remap so that the water part of the ramp lines up with z < 0 exactly.
  let t;
  if (wet > 0.001 && h < wet) t = (h / wet) * 0.25;
  else t = 0.25 + ((h - wet) / Math.max(1e-6, 1 - wet)) * 0.75;
  t = Math.min(1, Math.max(0, t));

  for (let i = 1; i < TOPO_STOPS.length; i++) {
    if (t <= TOPO_STOPS[i][0] || i === TOPO_STOPS.length - 1) {
      const [t0, c0] = TOPO_STOPS[i - 1];
      const [t1, c1] = TOPO_STOPS[i];
      return mixRGB(c0, c1, (t - t0) / (t1 - t0 || 1e-9), out);
    }
  }
  return mixRGB(TOPO_STOPS[0][1], TOPO_STOPS[0][1], 0, out);
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
  const wet = grid.zmin < 0 ? Math.min(1, (0 - grid.zmin) / (grid.zmax - grid.zmin)) : 0;

  for (let j = 0; j <= n; j++) {
    const yy = grid.y(j);
    for (let i = 0; i <= n; i++) {
      const k = j * w + i;
      const xx = grid.x(i);
      const z = grid.valid[k] ? grid.z[k] : 0;

      positions[k * 3] = field.worldX(xx);
      positions[k * 3 + 1] = field.worldY(z);
      positions[k * 3 + 2] = field.worldZ(yy);

      field.worldNormal(xx, yy, nrm);
      normals[k * 3] = nrm.x; normals[k * 3 + 1] = nrm.y; normals[k * 3 + 2] = nrm.z;

      const [fx, fy] = field.gradient(xx, yy);
      const slope = isFinite(fx) && isFinite(fy) ? Math.hypot(fx, fy) / grid.slopeRef : 0;
      biomeColor(grid.norm(z), z, slope, hash2(i, j), rgb);
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
export function recolorSurface(field, grid, geometry, topographic) {
  const colors = geometry.getAttribute('color');
  const arr = colors.array;
  const { n, w } = grid;
  const rgb = [0, 0, 0];
  const wet = grid.zmin < 0 ? Math.min(1, (0 - grid.zmin) / (grid.zmax - grid.zmin)) : 0;

  for (let j = 0; j <= n; j++) {
    const yy = grid.y(j);
    for (let i = 0; i <= n; i++) {
      const k = j * w + i;
      const z = grid.valid[k] ? grid.z[k] : 0;
      if (topographic) {
        topoColor(grid.norm(z), wet, rgb);
      } else {
        const [fx, fy] = field.gradient(grid.x(i), yy);
        const slope = isFinite(fx) && isFinite(fy) ? Math.hypot(fx, fy) / grid.slopeRef : 0;
        biomeColor(grid.norm(z), z, slope, hash2(i, j), rgb);
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
 * A small, finely-sampled sheet that follows the player.
 *
 * Without this, zooming the character down by 10^-4 would just park them on one
 * enormous flat triangle of the coarse mesh — the surface would look linear for
 * the wrong reason. The patch re-samples f at the current zoom scale, so what
 * the student sees flattening out is the actual function.
 */
export class LocalPatch {
  constructor(field, segments = 48) {
    this.field = field;
    this.seg = segments;
    this.radius = 0;      // in math units
    this.cx = NaN;
    this.cy = NaN;
    this.topographic = false;

    const w = segments + 1;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(w * w * 3), 3));
    geom.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(w * w * 3), 3));
    geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(w * w * 3), 3));

    const idx = [];
    for (let j = 0; j < segments; j++) {
      for (let i = 0; i < segments; i++) {
        const a = j * w + i, b = j * w + i + 1, c = (j + 1) * w + i, d = (j + 1) * w + i + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    geom.setIndex(idx);

    this.geometry = geom;
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0.0,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -8,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'local-patch';
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** Rebuild only when the player has drifted or the zoom level changed. */
  update(cx, cy, radius, grid, topographic, force) {
    const moved = !isFinite(this.cx) || Math.hypot(cx - this.cx, cy - this.cy) > radius * 0.25;
    const resized = Math.abs(radius - this.radius) > radius * 1e-3;
    if (!force && !moved && !resized && topographic === this.topographic) return;

    this.cx = cx; this.cy = cy; this.radius = radius; this.topographic = topographic;

    const { field, seg } = this;
    const w = seg + 1;
    const pos = this.geometry.getAttribute('position');
    const nor = this.geometry.getAttribute('normal');
    const colAttr = this.geometry.getAttribute('color');
    const P = pos.array, N = nor.array, C = colAttr.array;

    const nrm = new THREE.Vector3();
    const rgb = [0, 0, 0];
    const wet = grid.zmin < 0 ? Math.min(1, (0 - grid.zmin) / (grid.zmax - grid.zmin)) : 0;
    // Gradient step scaled to the patch, so normals stay meaningful when tiny.
    const h = radius * 1e-3;
    let anyValid = false;

    for (let j = 0; j < w; j++) {
      const yy = cy + (j / seg - 0.5) * 2 * radius;
      for (let i = 0; i < w; i++) {
        const xx = cx + (i / seg - 0.5) * 2 * radius;
        const k = j * w + i;
        const z = field.height(xx, yy);
        const zz = isFinite(z) ? z : 0;
        if (isFinite(z)) anyValid = true;

        P[k * 3] = field.worldX(xx);
        P[k * 3 + 1] = field.worldY(zz);
        P[k * 3 + 2] = field.worldZ(yy);

        field.worldNormal(xx, yy, nrm);
        N[k * 3] = nrm.x; N[k * 3 + 1] = nrm.y; N[k * 3 + 2] = nrm.z;

        if (topographic) {
          topoColor(grid.norm(zz), wet, rgb);
        } else {
          const [fx, fy] = field.gradient(xx, yy, h);
          const slope = isFinite(fx) && isFinite(fy) ? Math.hypot(fx, fy) / grid.slopeRef : 0;
          biomeColor(grid.norm(zz), zz, slope, hash2(i, j), rgb);
        }
        C[k * 3] = rgb[0]; C[k * 3 + 1] = rgb[1]; C[k * 3 + 2] = rgb[2];
      }
    }

    pos.needsUpdate = true;
    nor.needsUpdate = true;
    colAttr.needsUpdate = true;
    this.geometry.computeBoundingSphere();
    this.mesh.visible = anyValid;

    // Float the patch just clear of the coarse mesh.
    //
    // Depth-buffer tricks are not enough here: the two surfaces differ by real
    // geometry, and the chord error of a coarse cell can be centimetres. Once
    // the explorer is a fraction of a millimetre tall, centimetres is a chasm
    // and the coarse triangles would swallow the patch. So measure the actual
    // gap and lift by it.
    let gap = 0;
    const probes = [[0, 0], [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]];
    for (const [px, py] of probes) {
      const sx = cx + px * radius, sy = cy + py * radius;
      const coarse = grid.meshHeight(sx, sy);
      const exact = field.height(sx, sy);
      if (isFinite(coarse) && isFinite(exact)) gap = Math.max(gap, coarse - exact);
    }
    const worldRadius = radius * field.S;
    this.mesh.position.y = field.worldY(gap) + worldRadius * 0.004;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
