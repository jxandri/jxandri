/**
 * decor.js — scattering trees, rocks, grass and snow across the surface.
 *
 * Every decoration is an InstancedMesh so the whole forest is a handful of draw
 * calls. Crucially none of it touches the surface geometry: the graph of f stays
 * a smooth C^1 sheet and the rugged, nowhere-differentiable stuff simply stands
 * on it. Seen from a distance the mountain still reads as the plot it is.
 *
 * Instances are placed at the *triangulated* height rather than at exact
 * f(x,y), so nothing floats above or sinks into the mesh the student sees.
 */

import * as THREE from '../vendor/three.module.js';
import { bandWeight } from './terrain.js';

/* --------------------------------------------------------------- helpers */

/** Deterministic RNG, so the same function always grows the same forest. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Merge simple non-indexed geometries (position + normal, one colour each)
 * into a single BufferGeometry. Saves vendoring BufferGeometryUtils.
 */
function mergeParts(parts) {
  let total = 0;
  for (const p of parts) {
    const g = p.geometry.index ? p.geometry.toNonIndexed() : p.geometry;
    p._g = g;
    total += g.getAttribute('position').count;
  }

  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  const c = new THREE.Color();
  let off = 0;

  for (const p of parts) {
    const g = p._g;
    const gp = g.getAttribute('position').array;
    const gn = g.getAttribute('normal').array;
    const count = g.getAttribute('position').count;
    c.set(p.color);
    for (let i = 0; i < count; i++) {
      pos[(off + i) * 3] = gp[i * 3];
      pos[(off + i) * 3 + 1] = gp[i * 3 + 1];
      pos[(off + i) * 3 + 2] = gp[i * 3 + 2];
      nor[(off + i) * 3] = gn[i * 3];
      nor[(off + i) * 3 + 1] = gn[i * 3 + 1];
      nor[(off + i) * 3 + 2] = gn[i * 3 + 2];
      col[(off + i) * 3] = c.r; col[(off + i) * 3 + 1] = c.g; col[(off + i) * 3 + 2] = c.b;
    }
    off += count;
    if (g !== p.geometry) g.dispose();
    p.geometry.dispose();
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

/* -------------------------------------------------------- part geometries */

function makeTreeGeometry(kind) {
  const parts = [];
  if (kind === 'conifer') {
    const trunk = new THREE.CylinderGeometry(0.09, 0.14, 1.5, 5, 1, false);
    trunk.translate(0, 0.75, 0);
    parts.push({ geometry: trunk, color: 0x4a3524 });
    for (let i = 0; i < 3; i++) {
      const t = i / 2;
      const cone = new THREE.ConeGeometry(0.95 - 0.28 * t, 1.9 - 0.35 * t, 7);
      cone.translate(0, 1.5 + i * 0.95 + (1.9 - 0.35 * t) / 2 - 0.35, 0);
      parts.push({ geometry: cone, color: i === 2 ? 0x2f5c2c : 0x24471f });
    }
  } else { // broadleaf
    const trunk = new THREE.CylinderGeometry(0.11, 0.18, 1.9, 5, 1, false);
    trunk.translate(0, 0.95, 0);
    parts.push({ geometry: trunk, color: 0x54402b });
    const crown = new THREE.IcosahedronGeometry(1.15, 0);
    crown.scale(1, 0.85, 1);
    crown.translate(0, 2.6, 0);
    parts.push({ geometry: crown, color: 0x3c6b2a });
    const crown2 = new THREE.IcosahedronGeometry(0.8, 0);
    crown2.translate(0.55, 2.1, 0.3);
    parts.push({ geometry: crown2, color: 0x34602a });
  }
  return mergeParts(parts);
}

function makeRockGeometry(seed, snowy) {
  // PolyhedronGeometry is already non-indexed, so no conversion is needed.
  const g = new THREE.IcosahedronGeometry(1, 0);
  const pos = g.getAttribute('position');
  const rnd = mulberry32(seed);

  // Jitter by vertex *location* so shared corners move together and the rock
  // stays closed rather than splitting along the flat-shaded seams.
  const key = new Map();
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    if (!key.has(k)) key.set(k, 0.72 + rnd() * 0.56);
    const s = key.get(k);
    pos.setXYZ(i, pos.getX(i) * s, pos.getY(i) * s * 0.8, pos.getZ(i) * s);
  }
  g.computeVertexNormals();

  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const nor = g.getAttribute('normal');
  for (let i = 0; i < pos.count; i++) {
    const up = Math.max(0, nor.getY(i));
    if (snowy) c.setRGB(0.86 + 0.12 * up, 0.88 + 0.11 * up, 0.93 + 0.07 * up);
    else {
      const t = 0.36 + 0.14 * up + 0.06 * rnd();
      c.setRGB(t, t * 0.96, t * 0.9);
    }
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

function makeGrassGeometry() {
  // A tuft of tapered blades. No textures, no alpha test — cheap everywhere.
  const pos = [];
  const nor = [];
  const col = [];
  const rnd = mulberry32(99);
  const blades = 4;
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + rnd() * 0.8;
    const lean = 0.18 + rnd() * 0.22;
    const h = 0.45 + rnd() * 0.35;
    const wdt = 0.055;
    const dx = Math.cos(a), dz = Math.sin(a);
    const px = dx * 0.09, pz = dz * 0.09;
    // one triangle: base left, base right, tip
    pos.push(px - dz * wdt, 0, pz + dx * wdt);
    pos.push(px + dz * wdt, 0, pz - dx * wdt);
    pos.push(px + dx * lean, h, pz + dz * lean);
    for (let i = 0; i < 3; i++) nor.push(0, 1, 0);
    const g0 = 0.26 + rnd() * 0.10;
    col.push(g0 * 0.7, g0, g0 * 0.35);
    col.push(g0 * 0.7, g0, g0 * 0.35);
    col.push(g0 * 1.1, g0 * 1.35, g0 * 0.5);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

function makeCloudGeometry() {
  const parts = [];
  const rnd = mulberry32(4242);
  for (let i = 0; i < 5; i++) {
    const r = 0.55 + rnd() * 0.55;
    const g = new THREE.IcosahedronGeometry(r, 1);
    g.scale(1.25, 0.68, 1.05);
    g.translate((rnd() - 0.5) * 2.1, (rnd() - 0.5) * 0.45, (rnd() - 0.5) * 1.5);
    parts.push({ geometry: g, color: 0xf4f8ff });
  }
  return mergeParts(parts);
}

/* --------------------------------------------------------------- the set */

class DecorLayer {
  constructor(geometry, count, castShadow, material) {
    const mat = material || new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(geometry, mat, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = !!castShadow;
    this.mesh.receiveShadow = false;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.capacity = count;
    this.base = new Float32Array(count * 16);
    this.inside = new Uint8Array(count);
    this.n = 0;
  }

  push(matrix, isInside) {
    if (this.n >= this.capacity) return;
    matrix.toArray(this.base, this.n * 16);
    this.inside[this.n] = isInside ? 1 : 0;
    this.n++;
  }

  finish() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.array.set(this.base.subarray(0, this.n * 16));
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.computeBoundingSphere();
  }

  /** Hide out-of-bounds instances by collapsing them to zero scale. */
  setIsolate(on) {
    const arr = this.mesh.instanceMatrix.array;
    for (let i = 0; i < this.n; i++) {
      if (on && !this.inside[i]) {
        for (let k = 0; k < 16; k++) arr[i * 16 + k] = 0;
      } else {
        for (let k = 0; k < 16; k++) arr[i * 16 + k] = this.base[i * 16 + k];
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

export class Decorations {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'decorations';
    this.layers = [];
  }

  clear() {
    for (const l of this.layers) { this.group.remove(l.mesh); l.dispose(); }
    this.layers = [];
  }

  setIsolate(on) { for (const l of this.layers) l.setIsolate(on); }
  setVisible(on) { this.group.visible = on; }

  /**
   * Populate the scene.
   * @param density 0..2 multiplier from the quality/density control
   */
  build(field, grid, predicate, options) {
    const o = options || {};
    const density = o.density ?? 1;
    const shadows = !!o.shadows;
    this.clear();
    if (density <= 0 || !grid.anyValid) return;

    const S = field.S;
    // Decoration size is tied to world scale: a tree is ~7 m tall regardless of
    // what the domain numbers are, so the human stays the reference for scale.
    const unit = Math.max(0.4, field.worldSize / 200) * 1.0;

    const area = field.worldSize * field.worldSize;
    const cap = (per10k) => Math.max(16, Math.round((area / 10000) * per10k * density));

    const conifer = new DecorLayer(makeTreeGeometry('conifer'), cap(190), shadows);
    const broadleaf = new DecorLayer(makeTreeGeometry('broadleaf'), cap(120), shadows);
    const rock = new DecorLayer(makeRockGeometry(7, false), cap(130), shadows);
    const snowRock = new DecorLayer(makeRockGeometry(13, true), cap(70), false);
    const grass = new DecorLayer(makeGrassGeometry(), cap(420), false);
    const cloud = new DecorLayer(makeCloudGeometry(), cap(26), false,
      new THREE.MeshLambertMaterial({
        vertexColors: true, transparent: true, opacity: 0.72,
        depthWrite: false, side: THREE.DoubleSide,
      }));
    cloud.mesh.renderOrder = 4;

    this.layers = [conifer, broadleaf, rock, snowRock, grass, cloud];

    const rnd = mulberry32(0x5eed);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const nrm = new THREE.Vector3();
    const axis = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const posv = new THREE.Vector3();

    const totalTries = Math.round((conifer.capacity + broadleaf.capacity + rock.capacity + snowRock.capacity + grass.capacity) * 1.6);

    const place = (layer, x, y, z, alignFactor, scale, yaw) => {
      posv.set(field.worldX(x), field.worldY(z), field.worldZ(y));
      field.worldNormal(x, y, nrm);
      // Blend toward world-up: trees grow up, rocks lie flat on the slope.
      axis.copy(up).lerp(nrm, alignFactor).normalize();
      q.setFromUnitVectors(up, axis);
      const spin = new THREE.Quaternion().setFromAxisAngle(up, yaw);
      q.multiply(spin);
      scl.set(scale, scale, scale);
      m.compose(posv, q, scl);
      layer.push(m, predicate(x, y));
    };

    for (let t = 0; t < totalTries; t++) {
      const x = field.xmin + rnd() * (field.xmax - field.xmin);
      const y = field.ymin + rnd() * (field.ymax - field.ymin);

      const z = grid.meshHeight(x, y);
      if (!isFinite(z)) continue;

      const hN = grid.landNorm(z);
      // Slope relative to this surface's median, so the rules read the same
      // way on a gentle paraboloid and on a near-conical Cobb-Douglas surface.
      const [fx, fy] = field.gradient(x, y);
      const slope = isFinite(fx) && isFinite(fy) ? Math.hypot(fx, fy) / grid.slopeRef : 0;
      const flat = 1 - Math.min(1, slope / 2.6);
      const yaw = rnd() * Math.PI * 2;
      const r = rnd();

      if (z < 0) continue;               // below the waterline: leave it to the lake

      // Every population is driven by the band weights, so what grows where
      // matches the colour underneath it exactly. Sizes stay relative to the
      // 1.8 m explorer: boulders 0.4-1.6 m, trees 4-9 m, grass ankle-high.
      const wBeach = bandWeight(1, hN);
      const wDeep = bandWeight(2, hN);      // dense forest
      const wLight = bandWeight(3, hN);     // thinning woodland
      const wArid = bandWeight(4, hN);
      const wVolcanic = bandWeight(5, hN);
      const wSnow = bandWeight(6, hN);
      const wCloud = bandWeight(7, hN);

      if (z < 0) continue;                  // below the waterline: leave the lake

      // Clouds hang above the highest ground rather than resting on it.
      if (wCloud > 0.02 && r < wCloud * 0.5) {
        const lift = unit * (14 + rnd() * 22);
        posv.set(field.worldX(x), field.worldY(z) + lift, field.worldZ(y));
        q.identity();
        const spin = new THREE.Quaternion().setFromAxisAngle(up, yaw);
        q.multiply(spin);
        scl.setScalar(unit * (3.0 + rnd() * 3.5));
        m.compose(posv, q, scl);
        cloud.push(m, predicate(x, y));
        continue;
      }

      if (wSnow > 0.02 && r < wSnow * 0.42 * flat + 0.06) {
        place(snowRock, x, y, z, 0.9, unit * (0.22 + rnd() * 0.45), yaw);
        continue;
      }

      // Bare rock on the arid and volcanic bands, and on anything steep.
      const stony = wArid * 0.5 + wVolcanic * 0.9;
      if ((stony > 0.02 || slope > 1.5) && r < 0.16 + stony * 0.5) {
        place(rock, x, y, z, 0.85, unit * (0.20 + rnd() * 0.60), yaw);
        continue;
      }

      // Trees: frequent through the deep-vegetation band, thinning out through
      // the lighter one, gone by the time the ground turns arid.
      const treeChance = (wDeep * 0.85 + wLight * 0.30) * flat;
      if (r < treeChance && slope < 2.4) {
        const layer = wDeep > wLight ? conifer : (rnd() < 0.5 ? broadleaf : conifer);
        place(layer, x, y, z, 0.28, unit * (0.70 + rnd() * 0.70), yaw);
        continue;
      }

      // Grass on the beach and through the vegetated bands.
      const grassChance = wBeach * 0.25 + wDeep * 0.7 + wLight * 0.8;
      if (r < grassChance && slope < 3.0) {
        place(grass, x, y, z, 0.7, unit * (0.45 + rnd() * 0.55), yaw);
      }
    }

    for (const l of this.layers) { l.finish(); this.group.add(l.mesh); }
  }

  get counts() {
    const [c, b, r, s, g] = this.layers.length ? this.layers : [];
    return {
      trees: (c ? c.n : 0) + (b ? b.n : 0),
      rocks: (r ? r.n : 0) + (s ? s.n : 0),
      grass: g ? g.n : 0,
    };
  }
}
