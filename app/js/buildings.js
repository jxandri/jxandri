/**
 * buildings.js — real building footprints, standing on the graph of f.
 *
 * Fifteen hundred outlines from Overture Maps, extruded from the ground the
 * function defines. They are scenery in the strict sense used everywhere else
 * in this program: nothing here touches the surface geometry, and the function
 * a student differentiates is the altitude of the *ground*, not of the roof.
 * Walking into a lecture theatre does not change f; a tower block is not a
 * local maximum; the gradient at a doorway is the slope of the hillside the
 * doorway was cut into. Saying that out loud to a class is most of why the
 * buildings are worth drawing at all — they make the distinction between the
 * surface and the things on it concrete instead of theoretical.
 *
 * Everything is one merged BufferGeometry, so the whole neighbourhood is two
 * draw calls rather than three thousand.
 *
 * Two details that matter for it to look right:
 *
 *   Each building is set at the *lowest* ground its outline covers, and its
 *   walls are dropped a little below that. A building placed at the height of
 *   its centre floats at the downhill corner on a slope this steep — a fifth of
 *   a kilometre of fall across the campus — and a skirt is cheaper and more
 *   robust than trying to follow the terrain around the footprint.
 *
 *   Heights go through field.worldY, exactly like the terrain, so the vertical
 *   exaggeration dial moves the buildings and the hillside together. At the
 *   true scale of 1 they are their real heights in metres.
 */

import * as THREE from '../vendor/three.module.js';

/** Signed area of a ring, in the domain's own units. */
function signedArea(ring) {
  let a = 0;
  const n = ring.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += ring[i * 2] * ring[j * 2 + 1] - ring[j * 2] * ring[i * 2 + 1];
  }
  return a / 2;
}

/**
 * Ear clipping for a simple polygon. Footprints are small and mostly convex —
 * a few dozen vertices at worst — so the O(n²) version is far below noticing,
 * and it avoids vendoring a triangulator for one example.
 */
function triangulate(ring) {
  const n = ring.length / 2;
  if (n < 3) return [];
  const idx = [];
  for (let i = 0; i < n; i++) idx.push(i);
  if (signedArea(ring) < 0) idx.reverse();          // work counter-clockwise

  const px = (i) => ring[idx[i] * 2];
  const py = (i) => ring[idx[i] * 2 + 1];
  const cross = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

  const out = [];
  let guard = n * n + 16;
  while (idx.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const a = (i + idx.length - 1) % idx.length, b = i, c = (i + 1) % idx.length;
      const ax = px(a), ay = py(a), bx = px(b), by = py(b), cx = px(c), cy = py(c);
      if (cross(ax, ay, bx, by, cx, cy) <= 0) continue;      // reflex
      let clean = true;
      for (let k = 0; k < idx.length; k++) {
        if (k === a || k === b || k === c) continue;
        const qx = px(k), qy = py(k);
        if (cross(ax, ay, bx, by, qx, qy) >= 0
          && cross(bx, by, cx, cy, qx, qy) >= 0
          && cross(cx, cy, ax, ay, qx, qy) >= 0) { clean = false; break; }
      }
      if (!clean) continue;
      out.push(idx[a], idx[b], idx[c]);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;              // degenerate ring; take what we have
  }
  if (idx.length === 3) out.push(idx[0], idx[1], idx[2]);
  return out;
}

/**
 * Build the whole neighbourhood.
 *
 * @param field    the world mapping (kilometres to metres on screen)
 * @param grid     the built mesh, for the ground height actually drawn
 * @param list     [{ ring: Float32Array of x,y pairs in domain units, height: metres }]
 * @param predicate inside-the-feasible-set test, for the isolate mode
 * @returns { group, dispose } or null if nothing could be placed
 */
export function buildBuildings(field, grid, list, predicate) {
  if (!list || !list.length) return null;

  // A neighbourhood is not one material. Every building gets a small
  // deterministic shift along two axes — how pale the walls are and how warm
  // the roof is — from its own position, so the block reads as a hundred
  // buildings rather than one extruded mass, and so it looks the same on
  // every reload.
  const ROOF = new THREE.Color();
  const WALL = new THREE.Color();
  const hash = (x, y) => {
    const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return v - Math.floor(v);
  };

  const pos = [];
  const nor = [];
  const col = [];
  const groups = [[], []];             // inside, outside — same split the surface uses

  const push = (x, y, z, nx, ny, nz, c) => {
    pos.push(x, y, z); nor.push(nx, ny, nz); col.push(c.r, c.g, c.b);
    return pos.length / 3 - 1;
  };

  let placed = 0, skipped = 0;
  for (const b of list) {
    const ring = b.ring;
    const n = ring.length / 2;
    if (n < 3) { skipped++; continue; }

    // The ground the outline stands on, read off the mesh the student sees so
    // nothing floats or sinks. The lowest corner wins; the walls then reach a
    // little below it, which hides the join on a slope.
    let low = Infinity, high = -Infinity, ok = true;
    for (let i = 0; i < n; i++) {
      const z = grid.meshHeight(ring[i * 2], ring[i * 2 + 1]);
      if (!isFinite(z)) { ok = false; break; }
      low = Math.min(low, z); high = Math.max(high, z);
    }
    if (!ok) { skipped++; continue; }

    const baseW = field.worldY(low) - Math.max(field.worldY(high - low), 0) - 0.4;
    const topW = field.worldY(low + b.height / 1000);
    if (!(isFinite(baseW) && isFinite(topW)) || topW <= baseW) { skipped++; continue; }

    const t1 = hash(ring[0], ring[1]);
    const t2 = hash(ring[1], ring[0]);
    WALL.setRGB(0.62 + t1 * 0.26, 0.60 + t1 * 0.24, 0.55 + t1 * 0.22);
    ROOF.setRGB(0.40 + t2 * 0.22, 0.37 + t2 * 0.19, 0.35 + t2 * 0.16);

    // Which group: by the footprint's first vertex, which is enough — a
    // building straddling a constraint boundary is not a case this has.
    const inside = predicate(ring[0], ring[1]);
    const tris = groups[inside ? 0 : 1];

    // --- the roof, one flat cap ---
    const cap = triangulate(ring);
    const roofBase = pos.length / 3;
    for (let i = 0; i < n; i++) {
      push(field.worldX(ring[i * 2]), topW, field.worldZ(ring[i * 2 + 1]), 0, 1, 0, ROOF);
    }
    // Winding: the domain's y runs to world −z, which flips handedness, so a
    // ring that was counter-clockwise on the map is clockwise on screen.
    for (let i = 0; i < cap.length; i += 3) {
      tris.push(roofBase + cap[i], roofBase + cap[i + 2], roofBase + cap[i + 1]);
    }

    // --- the walls, one quad an edge, flat-shaded ---
    const outward = signedArea(ring) > 0 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const x1 = field.worldX(ring[i * 2]), z1 = field.worldZ(ring[i * 2 + 1]);
      const x2 = field.worldX(ring[j * 2]), z2 = field.worldZ(ring[j * 2 + 1]);
      let nx = (z2 - z1) * outward, nz = -(x2 - x1) * outward;
      const len = Math.hypot(nx, nz) || 1;
      nx /= len; nz /= len;
      const a = push(x1, baseW, z1, nx, 0, nz, WALL);
      const bb = push(x2, baseW, z2, nx, 0, nz, WALL);
      const c = push(x2, topW, z2, nx, 0, nz, WALL);
      const d = push(x1, topW, z1, nx, 0, nz, WALL);
      tris.push(a, bb, c, a, c, d);
    }
    placed++;
  }

  if (!placed) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  const index = new Uint32Array(groups[0].length + groups[1].length);
  index.set(groups[0], 0);
  index.set(groups[1], groups[0].length);
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.addGroup(0, groups[0].length, 0);
  geometry.addGroup(groups[0].length, groups[1].length, 1);
  geometry.computeBoundingSphere();

  const mk = () => new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.82, metalness: 0.0, side: THREE.DoubleSide,
  });
  const materials = [mk(), mk()];
  const mesh = new THREE.Mesh(geometry, materials);
  mesh.name = 'buildings';
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const group = new THREE.Group();
  group.name = 'buildings';
  group.add(mesh);

  return {
    group,
    mesh,
    materials,
    placed,
    skipped,
    /** The isolate mode hides everything outside the feasible set. */
    setIsolate(on) {
      materials[1].transparent = !!on;
      materials[1].opacity = on ? 0.12 : 1;
      materials[1].depthWrite = !on;
      materials[1].needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
