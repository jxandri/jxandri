/**
 * surfaces.js — surfaces that are not graphs of a function.
 *
 * The rest of the program is a heightfield: one z for each (x, y), which is what
 * lets you walk on it, read ∂f/∂x off the ground and trace a level curve. Two
 * other kinds of surface do not fit that shape, and each loses something:
 *
 *   parametric  r(u,v) = (X, Y, Z)  — still a two-parameter sheet, so it has a
 *       tangent plane and a normal everywhere, and you can walk it by moving in
 *       (u,v). It has no ∂f/∂x, because there is no f.
 *
 *   implicit    F(x,y,z) = 0        — may have several sheets above one (x,y),
 *       may close on itself, may have no "up" at all. A sphere is the obvious
 *       case. There is a normal (∇F) and a tangent plane, but no walking and no
 *       level curves of a height function, because there is no height function.
 *
 * Both are meshed here and coloured by the same palettes as the terrain, so the
 * height ramp means the same thing whichever surface is on screen.
 */

import * as THREE from '../vendor/three.module.js';
import { heightColor, biomeColor } from './terrain.js';

/* ----------------------------------------------------------- parametric */

/**
 * Mesh r(u,v) over a rectangle of the parameter plane.
 *
 * Normals come from the cross product of the two parameter derivatives, taken
 * by central differences, which is exactly the surface normal wherever r is an
 * immersion. Where the two derivatives are parallel — the poles of a sphere in
 * polar coordinates, for instance — the cross product vanishes and we fall back
 * to the position vector, which keeps the poles from turning black.
 */
export function buildParametric(exprs, opts) {
  const { X, Y, Z } = exprs;
  const umin = opts.umin, umax = opts.umax, vmin = opts.vmin, vmax = opts.vmax;
  const n = opts.res || 160;
  const scale = opts.scale || 1;
  const sx = opts.sx ?? 1, sy = opts.sy ?? 1, sz = opts.sz ?? 1;

  const w = n + 1;
  const pos = new Float32Array(w * w * 3);
  const nor = new Float32Array(w * w * 3);
  const col = new Float32Array(w * w * 3);
  // The actual (u, v) of each vertex, so a raycast onto a triangle hands back
  // the parameter pair and the walker can be dropped exactly where you clicked.
  const uvs = new Float32Array(w * w * 2);
  const valid = new Uint8Array(w * w);

  const du = (umax - umin) / n, dv = (vmax - vmin) / n;
  const h = Math.min(du, dv) * 1e-3;

  const at = (u, v, out) => {
    // Math (X, Y, Z) into world axes, the same convention the terrain uses:
    // math X -> world X, math Z (height) -> world Y, math Y -> world -Z.
    out[0] = X(u, v) * scale * sx;
    out[1] = Z(u, v) * scale * sz;
    out[2] = -Y(u, v) * scale * sy;
    return isFinite(out[0]) && isFinite(out[1]) && isFinite(out[2]);
  };

  const P = [0, 0, 0], Pu = [0, 0, 0], Pv = [0, 0, 0];
  let ymin = Infinity, ymax = -Infinity;

  for (let j = 0; j < w; j++) {
    const v = vmin + j * dv;
    for (let i = 0; i < w; i++) {
      const u = umin + i * du;
      const k = j * w + i;
      uvs[k * 2] = u; uvs[k * 2 + 1] = v;
      if (!at(u, v, P)) { valid[k] = 0; continue; }
      valid[k] = 1;
      pos[k * 3] = P[0]; pos[k * 3 + 1] = P[1]; pos[k * 3 + 2] = P[2];
      if (P[1] < ymin) ymin = P[1];
      if (P[1] > ymax) ymax = P[1];

      const okU = at(u + h, v, Pu), okV = at(u, v + h, Pv);
      let nx = 0, ny = 1, nz = 0;
      if (okU && okV) {
        const ax = Pu[0] - P[0], ay = Pu[1] - P[1], az = Pu[2] - P[2];
        const bx = Pv[0] - P[0], by = Pv[1] - P[1], bz = Pv[2] - P[2];
        nx = ay * bz - az * by;
        ny = az * bx - ax * bz;
        nz = ax * by - ay * bx;
        const len = Math.hypot(nx, ny, nz);
        if (len > 1e-12) { nx /= len; ny /= len; nz /= len; }
        else { nx = P[0]; ny = P[1]; nz = P[2]; const l2 = Math.hypot(nx, ny, nz) || 1; nx /= l2; ny /= l2; nz /= l2; }
      }
      nor[k * 3] = nx; nor[k * 3 + 1] = ny; nor[k * 3 + 2] = nz;
    }
  }

  if (!(ymax > ymin)) { ymin = 0; ymax = 1; }
  const rgb = [0, 0, 0];
  for (let k = 0; k < w * w; k++) {
    heightColor((pos[k * 3 + 1] - ymin) / (ymax - ymin), rgb);
    col[k * 3] = rgb[0]; col[k * 3 + 1] = rgb[1]; col[k * 3 + 2] = rgb[2];
  }

  const idx = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * w + i, b = j * w + i + 1, c = (j + 1) * w + i, d = (j + 1) * w + i + 1;
      if (!(valid[a] && valid[b] && valid[c] && valid[d])) continue;
      idx.push(a, c, b, b, c, d);
    }
  }
  if (idx.length === 0) return null;

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geom.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geom.setIndex(idx);
  geom.computeBoundingSphere();

  const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide,
  }));
  mesh.name = 'parametric-surface';
  return { mesh, ymin, ymax, bounds: geom.boundingSphere };
}

/* -------------------------------------------------------------- implicit */

/**
 * Marching tetrahedra over F(x,y,z) = 0.
 *
 * Tetrahedra rather than cubes on purpose: the cube algorithm needs a 256-entry
 * triangle table and has genuinely ambiguous cases, while splitting each cell
 * into six tetrahedra needs no table at all — a tetrahedron has only two
 * topologically distinct crossings — and is watertight by construction. It
 * costs perhaps twice the triangles, which for a teaching tool is a bargain
 * against several hundred lines of lookup data.
 */
const TETS = [
  [0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6],
  [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6],
];

// Corner offsets of a unit cell, indexed as the tetrahedra above expect.
const CORNER = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
];

export function buildImplicit(F, opts) {
  const n = opts.res || 48;
  const { xmin, xmax, ymin, ymax, zmin, zmax } = opts;
  const scale = opts.scale || 1;
  const sx = opts.sx ?? 1, sy = opts.sy ?? 1, sz = opts.sz ?? 1;

  const w = n + 1;
  const dx = (xmax - xmin) / n, dy = (ymax - ymin) / n, dz = (zmax - zmin) / n;

  // One pass to sample F on the lattice; the mesher then only reads it.
  const val = new Float32Array(w * w * w);
  const at = (i, j, k) => val[(k * w + j) * w + i];
  for (let k = 0; k < w; k++) {
    const z = zmin + k * dz;
    for (let j = 0; j < w; j++) {
      const y = ymin + j * dy;
      for (let i = 0; i < w; i++) {
        const v = F(xmin + i * dx, y, z);
        val[(k * w + j) * w + i] = isFinite(v) ? v : NaN;
      }
    }
  }

  const pos = [];
  const px = [0, 0, 0, 0], py = [0, 0, 0, 0], pz = [0, 0, 0, 0], pv = [0, 0, 0, 0];

  // Linear interpolation to the zero crossing between two lattice corners.
  const emit = (a, b) => {
    const t = pv[a] / (pv[a] - pv[b]);
    pos.push(
      (px[a] + (px[b] - px[a]) * t) * scale * sx,
      (pz[a] + (pz[b] - pz[a]) * t) * scale * sz,      // math z is world up
      -(py[a] + (py[b] - py[a]) * t) * scale * sy,
    );
  };

  for (let k = 0; k < n; k++) {
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        for (const tet of TETS) {
          let bad = false;
          for (let c = 0; c < 4; c++) {
            const [oi, oj, ok] = CORNER[tet[c]];
            const vv = at(i + oi, j + oj, k + ok);
            if (!isFinite(vv)) { bad = true; break; }
            px[c] = xmin + (i + oi) * dx;
            py[c] = ymin + (j + oj) * dy;
            pz[c] = zmin + (k + ok) * dz;
            pv[c] = vv;
          }
          if (bad) continue;

          // Which corners are inside. Only the count and pattern matter.
          const m = (pv[0] < 0 ? 1 : 0) | (pv[1] < 0 ? 2 : 0)
                  | (pv[2] < 0 ? 4 : 0) | (pv[3] < 0 ? 8 : 0);
          if (m === 0 || m === 15) continue;

          // One corner apart from the other three: a single triangle.
          // Two against two: a quad, emitted as two triangles.
          switch (m) {
            case 1: case 14: emit(0, 1); emit(0, 2); emit(0, 3); break;
            case 2: case 13: emit(1, 0); emit(1, 3); emit(1, 2); break;
            case 4: case 11: emit(2, 0); emit(2, 1); emit(2, 3); break;
            case 8: case 7:  emit(3, 0); emit(3, 2); emit(3, 1); break;
            case 3: case 12:
              emit(0, 2); emit(0, 3); emit(1, 3);
              emit(0, 2); emit(1, 3); emit(1, 2); break;
            case 5: case 10:
              emit(0, 1); emit(2, 3); emit(0, 3);
              emit(0, 1); emit(1, 2); emit(2, 3); break;
            case 6: case 9:
              emit(0, 1); emit(0, 2); emit(3, 1);
              emit(0, 2); emit(3, 2); emit(3, 1); break;
            default: break;
          }
        }
      }
    }
  }

  if (pos.length === 0) return null;

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.computeVertexNormals();

  // Colour by world height, on the same ramp as everything else.
  const arr = geom.getAttribute('position').array;
  let lo = Infinity, hi = -Infinity;
  for (let a = 1; a < arr.length; a += 3) { if (arr[a] < lo) lo = arr[a]; if (arr[a] > hi) hi = arr[a]; }
  if (!(hi > lo)) { lo = 0; hi = 1; }
  const col = new Float32Array(arr.length);
  const rgb = [0, 0, 0];
  for (let a = 0; a < arr.length; a += 3) {
    heightColor((arr[a + 1] - lo) / (hi - lo), rgb);
    col[a] = rgb[0]; col[a + 1] = rgb[1]; col[a + 2] = rgb[2];
  }
  geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geom.computeBoundingSphere();

  const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.85, metalness: 0.0, side: THREE.DoubleSide,
  }));
  mesh.name = 'implicit-surface';
  return { mesh, ymin: lo, ymax: hi, triangles: pos.length / 9, bounds: geom.boundingSphere };
}

/* ----------------------------------------------------------- painting */

/**
 * Repaint a parametric or implicit surface as terrain, or as a height ramp.
 *
 * Both surfaces are built with the ramp, which is the right default for reading
 * a shape — but it is not what the vegetation is scattered against. The forest
 * grows in bands: dark timber low down, thinning woodland, scree, snow. Painted
 * with the ramp underneath it, a snowfield sits on bright red ground, and the
 * one thing the decoration is for — saying at a glance how high you are —
 * contradicts the colour it stands on. Painted with the bands, the two agree,
 * exactly as they do on a heightfield.
 *
 * "How high" is the vertex's world y over the surface's own range, the same
 * number that chose the band for the tree standing there. Nothing is steep
 * (see decor.js for why the local vertical is the normal here), and nothing is
 * underwater, so the two arguments biomeColor uses to darken cliffs and lake
 * beds are passed as their neutral values.
 *
 * @param palette 'biome' (terrain) or 'height' (the ramp)
 */
/**
 * The Möbius lap gradient: one journey's worth of colour.
 *
 * White where the explorer starts, deepest blue at the far side of the lap,
 * white again on return — colour as a function of the long parameter alone,
 *
 *     t(u) = (1 − cos(2π (u − u0) / period)) / 2,
 *
 * which is periodic and smooth, so it closes up over the strip's seam. It has
 * to be a function of u only to be well defined at all: the seam glues (umin, v)
 * to (umax, −v), and any colour that depended on v would tear there.
 *
 * The point of the exercise is what this gradient *cannot* show. Walking one
 * full lap brings the explorer back to pure white — same u, same v, same point
 * of the strip — yet they now face the other side of the flag planted at the
 * start. The colouring, like any continuous function on the surface, is blind
 * to the side; only the journey detects it. That is non-orientability, told by
 * a golf flag.
 *
 * @param u0  the u of the explorer's default start (the white pole of the ramp)
 */
export function paintMobius(mesh, u0, umin, umax) {
  if (!mesh) return;
  const geom = mesh.geometry;
  const pos = geom.getAttribute('position');
  const uv = geom.getAttribute('uv');
  if (!pos || !uv) return;
  const n = pos.count;

  let attr = geom.getAttribute('color');
  if (!attr || attr.count !== n) {
    attr = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    geom.setAttribute('color', attr);
  }

  const period = (umax - umin) || Math.PI * 2;
  const W = MOBIUS_WHITE, B = MOBIUS_BLUE;
  for (let i = 0; i < n; i++) {
    const t = (1 - Math.cos(((uv.getX(i) - u0) / period) * Math.PI * 2)) / 2;
    attr.setXYZ(i,
      W[0] + (B[0] - W[0]) * t,
      W[1] + (B[1] - W[1]) * t,
      W[2] + (B[2] - W[2]) * t);
  }
  attr.needsUpdate = true;
}

/** The two poles of the lap gradient — shared with the flag's two pennants. */
export const MOBIUS_WHITE = [0.97, 0.97, 0.98];
export const MOBIUS_BLUE = [0.05, 0.13, 0.58];

export function paintMesh(mesh, palette) {
  if (!mesh) return;
  const geom = mesh.geometry;
  const pos = geom.getAttribute('position');
  if (!pos) return;
  const n = pos.count;

  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) {
    const y = pos.getY(i);
    if (y < lo) lo = y;
    if (y > hi) hi = y;
  }
  if (!(hi > lo)) { lo = 0; hi = 1; }

  let attr = geom.getAttribute('color');
  if (!attr || attr.count !== n) {
    attr = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    geom.setAttribute('color', attr);
  }
  const rgb = [0, 0, 0];
  const biome = palette !== 'height';
  for (let i = 0; i < n; i++) {
    const h = (pos.getY(i) - lo) / (hi - lo);
    if (biome) biomeColor(h, 1, 0, pos.getX(i), pos.getZ(i), rgb);
    else heightColor(h, rgb);
    attr.setXYZ(i, rgb[0], rgb[1], rgb[2]);
  }
  attr.needsUpdate = true;
}
