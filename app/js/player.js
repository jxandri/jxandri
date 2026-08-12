/**
 * player.js — the explorer, the drone, and the cameras.
 *
 * The character is built from primitives (no downloaded assets, nothing to
 * license, a few hundred triangles) and is exactly 1.80 m tall at zoom 1, so it
 * is the scale reference for everything else: the 1 m and 2 m derivative discs,
 * the tree heights, the wall heights.
 *
 * The zoom-in ruler shrinks the character by powers of ten. Movement speed, eye
 * height and camera distance shrink with it, so from the player's point of view
 * nothing changes — but the patch of surface they can reach gets ten times
 * smaller each notch, and a differentiable f flattens into its tangent plane.
 */

import * as THREE from '../vendor/three.module.js';

export const MODE_FIRST = 'first';
export const MODE_THIRD = 'third';
export const MODE_DRONE = 'drone';

const BODY_HEIGHT = 1.80;   // metres at zoom 1
const EYE_HEIGHT = 1.66;

function box(w, h, d, color) {
  const g = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.MeshLambertMaterial({ color });
  return new THREE.Mesh(g, m);
}

function cyl(rt, rb, h, color, seg) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg || 12);
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color }));
}

/**
 * A limb that swings from its top end.
 * The mesh hangs below the pivot so the walk cycle can just rotate the pivot.
 */
function limb(x, y, color, len, thick, depth) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, 0);
  const m = box(thick, len, depth || thick, color);
  m.position.y = -len / 2;
  pivot.add(m);
  return pivot;
}

/**
 * Character styles.
 *
 * Every one is exactly 1.80 m tall with its origin at the feet, and every one
 * exposes the same `parts` — hips, two arms, two legs, head — so the walk cycle
 * and the camera work identically whichever is chosen.
 */
const STYLES = {
  /** The original: a hiker in a hi-vis jacket and a hat. */
  explorer(root) {
    const hips = new THREE.Group();
    hips.position.y = 0.92;
    root.add(hips);

    const torso = box(0.42, 0.62, 0.24, 0xff7a2f);
    torso.position.y = 0.31;
    hips.add(torso);
    const pack = box(0.30, 0.36, 0.16, 0x35424f);
    pack.position.set(0, 0.34, -0.19);
    hips.add(pack);
    const neck = box(0.14, 0.08, 0.14, 0xf2c49a);
    neck.position.y = 0.66;
    hips.add(neck);

    const head = box(0.24, 0.26, 0.24, 0xffd2a6);
    head.position.y = 0.83;
    hips.add(head);
    const hat = box(0.30, 0.09, 0.30, 0x2f4858);
    hat.position.y = 0.98;
    const brim = box(0.40, 0.03, 0.40, 0x2f4858);
    brim.position.y = 0.93;
    hips.add(hat, brim);

    const armL = limb(-0.29, 0.56, 0xe86a28, 0.60, 0.13);
    const armR = limb(0.29, 0.56, 0xe86a28, 0.60, 0.13);
    const legL = limb(-0.12, 0, 0x3358a8, 0.90, 0.16);
    const legR = limb(0.12, 0, 0x3358a8, 0.90, 0.16);
    hips.add(armL, armR, legL, legR);
    return { hips, armL, armR, legL, legR, head };
  },

  /** A minifigure: cylindrical head with a stud, flared torso, C-shaped hands. */
  brick(root) {
    const hips = new THREE.Group();
    hips.position.y = 0.74;                       // legs are one solid block
    root.add(hips);

    const legBlock = box(0.44, 0.74, 0.30, 0x2255cc);
    legBlock.position.y = -0.37;
    hips.add(legBlock);
    const hipBlock = box(0.46, 0.10, 0.32, 0x1a44a8);
    hipBlock.position.y = 0.02;
    hips.add(hipBlock);

    const torso = cyl(0.22, 0.30, 0.56, 0xd11f2d, 16);
    torso.position.y = 0.34;
    hips.add(torso);

    const neck = cyl(0.09, 0.09, 0.06, 0xf5c518, 12);
    neck.position.y = 0.65;
    hips.add(neck);

    const head = cyl(0.20, 0.20, 0.36, 0xf5c518, 18);
    head.position.y = 0.86;
    hips.add(head);
    const stud = cyl(0.08, 0.08, 0.07, 0xf5c518, 12);
    stud.position.y = 1.07;
    hips.add(stud);
    // A face, so it reads as a character rather than a peg.
    for (const sx of [-0.07, 0.07]) {
      const eye = cyl(0.028, 0.028, 0.02, 0x1a1a1a, 8);
      eye.rotation.x = Math.PI / 2;
      eye.position.set(sx, 0.90, 0.196);
      hips.add(eye);
    }
    const smile = box(0.13, 0.02, 0.01, 0x1a1a1a);
    smile.position.set(0, 0.81, 0.198);
    hips.add(smile);

    const armL = limb(-0.30, 0.56, 0xd11f2d, 0.40, 0.13);
    const armR = limb(0.30, 0.56, 0xd11f2d, 0.40, 0.13);
    for (const [a, sgn] of [[armL, -1], [armR, 1]]) {
      const hand = cyl(0.085, 0.085, 0.09, 0xf5c518, 12);
      hand.position.set(sgn * 0.02, -0.44, 0.06);
      a.add(hand);
    }
    hips.add(armL, armR);

    // The legs are one moulded block, so the "legs" are stand-ins that keep
    // the walk cycle happy without visibly detaching.
    const legL = new THREE.Group(); const legR = new THREE.Group();
    hips.add(legL, legR);
    return { hips, armL, armR, legL, legR, head, stiffLegs: true };
  },

  /** Boxy, 32 units tall, four-unit limbs. */
  blocky(root) {
    const U = 1.8 / 32;                            // one pixel of the classic grid
    const hips = new THREE.Group();
    hips.position.y = 12 * U;
    root.add(hips);

    const torso = box(8 * U, 12 * U, 4 * U, 0x28b0a0);
    torso.position.y = 6 * U;
    hips.add(torso);

    const head = box(8 * U, 8 * U, 8 * U, 0xc79a6d);
    head.position.y = 16 * U;
    hips.add(head);
    const hair = box(8.3 * U, 2.4 * U, 8.3 * U, 0x3a2a1a);
    hair.position.y = 19.3 * U;
    hips.add(hair);
    for (const sx of [-1.9, 1.9]) {
      const eye = box(1.6 * U, 1.6 * U, 0.4 * U, 0xffffff);
      eye.position.set(sx * U, 16.6 * U, 4.05 * U);
      hips.add(eye);
      const pupil = box(0.8 * U, 1.6 * U, 0.5 * U, 0x2a3f6a);
      pupil.position.set((sx + (sx > 0 ? 0.4 : -0.4)) * U, 16.6 * U, 4.08 * U);
      hips.add(pupil);
    }

    const armL = limb(-6 * U, 11.5 * U, 0x2ec6b4, 12 * U, 4 * U);
    const armR = limb(6 * U, 11.5 * U, 0x2ec6b4, 12 * U, 4 * U);
    const legL = limb(-2 * U, 0, 0x3b4ea8, 12 * U, 4 * U);
    const legR = limb(2 * U, 0, 0x3b4ea8, 12 * U, 4 * U);
    hips.add(armL, armR, legL, legR);
    return { hips, armL, armR, legL, legR, head };
  },

  /** Round head, slab torso, slim limbs. */
  buddy(root) {
    const hips = new THREE.Group();
    hips.position.y = 0.78;
    root.add(hips);

    const torso = box(0.46, 0.52, 0.26, 0x35c05a);
    torso.position.y = 0.26;
    hips.add(torso);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 20, 16),
      new THREE.MeshLambertMaterial({ color: 0xffd34d }),
    );
    head.scale.set(1, 0.95, 0.95);
    head.position.y = 0.78;
    hips.add(head);
    for (const sx of [-0.09, 0.09]) {
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 10, 8),
        new THREE.MeshLambertMaterial({ color: 0x20242c }),
      );
      eye.position.set(sx, 0.82, 0.215);
      hips.add(eye);
    }
    const smile = new THREE.Mesh(
      new THREE.TorusGeometry(0.075, 0.016, 8, 16, Math.PI),
      new THREE.MeshLambertMaterial({ color: 0x20242c }),
    );
    smile.rotation.z = Math.PI;
    smile.position.set(0, 0.72, 0.205);
    hips.add(smile);

    const armL = limb(-0.28, 0.46, 0xffd34d, 0.46, 0.10);
    const armR = limb(0.28, 0.46, 0xffd34d, 0.46, 0.10);
    const legL = limb(-0.13, 0, 0x2b3a8c, 0.76, 0.13);
    const legR = limb(0.13, 0, 0x2b3a8c, 0.76, 0.13);
    hips.add(armL, armR, legL, legR);
    return { hips, armL, armR, legL, legR, head };
  },
};

export const CHARACTER_STYLES = Object.keys(STYLES);

/** Build a character of the given style, 1.8 m tall with its origin at the feet. */
function buildCharacter(style) {
  const root = new THREE.Group();
  const make = STYLES[style] || STYLES.explorer;
  root.userData.parts = make(root);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  return root;
}

/** Small quadrotor for the flying camera. */
function buildDrone() {
  const root = new THREE.Group();
  const body = box(0.5, 0.16, 0.5, 0x2b3440);
  root.add(body);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 12, 8),
    new THREE.MeshLambertMaterial({ color: 0x6fd6ff }),
  );
  dome.position.y = 0.10;
  root.add(dome);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const arm = box(0.5, 0.05, 0.05, 0x39434f);
    arm.position.set(sx * 0.3, 0, sz * 0.3);
    arm.rotation.y = sx * sz > 0 ? Math.PI / 4 : -Math.PI / 4;
    root.add(arm);
    const rotor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.24, 0.02, 12),
      new THREE.MeshLambertMaterial({ color: 0x8899aa, transparent: true, opacity: 0.5 }),
    );
    rotor.position.set(sx * 0.5, 0.06, sz * 0.5);
    root.add(rotor);
    root.userData.rotors = root.userData.rotors || [];
    root.userData.rotors.push(rotor);
  }
  return root;
}

export class Player {
  constructor(field) {
    this.field = field;
    this.mode = MODE_THIRD;

    // Math-space position of the character.
    this.x = (field.xmin + field.xmax) / 2;
    this.y = (field.ymin + field.ymax) / 2;

    this.yaw = 0;       // radians, 0 looks toward −Z (math +y)
    this.pitch = -0.15;
    this.zoom = 1;      // 1, 0.1, 0.01, ... the "zoom-in ruler"
    this.frozen = false;
    this.walkPhase = 0;
    this.speedScale = 1;

    this.style = 'explorer';
    this.character = buildCharacter(this.style);
    this.facing = 0;

    this.drone = buildDrone();
    this.dronePos = new THREE.Vector3();
    this.droneActive = false;

    this.group = new THREE.Group();
    this.group.name = 'player';
    this.group.add(this.character, this.drone);
    this.drone.visible = false;

    this.thirdDistance = 5.0;
    this._roam = 0;
    this._camPos = new THREE.Vector3();
    this._camTarget = new THREE.Vector3();
    this._smoothCam = new THREE.Vector3();
    this._camReady = false;

    this.resetToDomainCentre();
  }

  /** Drop the character somewhere the function is actually defined. */
  resetToDomainCentre() {
    const f = this.field;
    const tryPoint = (x, y) => isFinite(f.height(x, y));

    let cx = (f.xmin + f.xmax) / 2, cy = (f.ymin + f.ymax) / 2;
    if (!tryPoint(cx, cy)) {
      let found = false;
      const N = 40;
      for (let j = 0; j <= N && !found; j++) {
        for (let i = 0; i <= N && !found; i++) {
          const x = f.xmin + (i / N) * (f.xmax - f.xmin);
          const y = f.ymin + (j / N) * (f.ymax - f.ymin);
          if (tryPoint(x, y)) { cx = x; cy = y; found = true; }
        }
      }
    }
    this.x = cx; this.y = cy;

    const h = this.height();
    this.dronePos.set(
      f.worldX(cx),
      f.worldY(isFinite(h) ? h : 0) + f.worldSize * 0.35,
      f.worldZ(cy) + f.worldSize * 0.30,
    );
    this._camReady = false;
  }

  height() { return this.field.height(this.x, this.y); }

  get charScale() { return this.zoom; }

  /** World position of the character's feet. */
  worldFeet(out) {
    const h = this.height();
    return this.field.toWorld(this.x, this.y, isFinite(h) ? h : 0, out || new THREE.Vector3());
  }

  setMode(mode) {
    // Coming back from the straight-down drone view, a near-vertical pitch
    // leaves the walker staring at their own hat. Level it off.
    if (mode !== MODE_DRONE && this.mode === MODE_DRONE && this.pitch < -0.9) {
      this.pitch = -0.25;
    }
    this.mode = mode;
    this.droneActive = mode === MODE_DRONE;
    this.drone.visible = mode === MODE_DRONE;
    this.character.visible = mode !== MODE_FIRST;
    this._camReady = false;
  }

  setZoom(zoom) {
    this.zoom = zoom;
    this._camReady = false;
  }

  /** Swap the character's look without disturbing where they are standing. */
  setStyle(style) {
    if (style === this.style) return;
    this.style = style;
    const wasVisible = this.character.visible;
    this.group.remove(this.character);
    this.character.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    this.character = buildCharacter(style);
    this.character.visible = wasVisible;
    this.group.add(this.character);
  }

  /**
   * A three-quarter aerial view of the whole plot. This is what the student
   * sees first: the surface as a surface, before they go and stand on it.
   */
  establishingShot(camera) {
    const f = this.field;
    const elevation = 0.62; // radians above the horizon
    const { centreY, dist } = this._framing(camera, 1.12);

    this.setMode(MODE_DRONE);
    this.dronePos.set(
      f.worldX(f.cx),
      centreY + Math.sin(elevation) * dist,
      f.worldZ(f.cy) + Math.cos(elevation) * dist,
    );
    this.yaw = 0;
    this.pitch = -elevation;
    this._camReady = false;
  }

  /** Snap the drone directly above the plot, looking down at the z = 0 plane. */
  topDown(camera) {
    const f = this.field;
    const { centreY, dist } = this._framing(camera, 1.05);
    this.setMode(MODE_DRONE);
    this.dronePos.set(f.worldX(f.cx), centreY + dist, f.worldZ(f.cy));
    this.yaw = 0;
    this.pitch = -Math.PI / 2 + 1e-4;
    this._camReady = false;
  }

  /**
   * Distance at which the whole plot fits in frame.
   *
   * The vertical extent matters as much as the footprint: because the world
   * scale is uniform, a function whose range rivals its domain width really is
   * as tall as it is wide, and framing on the footprint alone would crop it.
   */
  _framing(camera, margin) {
    const f = this.field;
    const zTop = f.zTop ?? 0, zBottom = f.zBottom ?? 0;
    const yTop = f.worldY(zTop), yBottom = f.worldY(zBottom);
    const centreY = (yTop + yBottom) / 2;

    const halfDiag = (f.worldSize / 2) * Math.SQRT2;
    const halfHeight = Math.abs(yTop - yBottom) / 2;
    const radius = Math.max(Math.hypot(halfDiag, halfHeight), f.worldSize * 0.25);

    const vFov = ((camera && camera.fov) || 62) * Math.PI / 180;
    const aspect = (camera && camera.aspect) || 1.6;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const dist = (radius / Math.sin(Math.min(vFov, hFov) / 2)) * (margin || 1.1);

    this._roam = dist * 1.35;
    return { centreY, dist };
  }

  /** Mouse look. dx/dy are raw pointer-lock deltas. */
  look(dx, dy, sensitivity = 0.0022) {
    this.yaw -= dx * sensitivity;
    this.pitch -= dy * sensitivity;
    const lim = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  }

  /**
   * @param input { forward, right, up, sprint } each in [-1, 1]
   */
  update(dt, input) {
    const f = this.field;

    if (this.mode === MODE_DRONE) {
      this._updateDrone(dt, input);
    } else if (!this.frozen) {
      this._updateWalk(dt, input);
    }

    // Place the character on the surface regardless of mode, so switching back
    // from the drone puts you exactly where you left off.
    const h = this.height();
    const wy = f.worldY(isFinite(h) ? h : 0);
    this.character.position.set(f.worldX(this.x), wy, f.worldZ(this.y));
    this.character.scale.setScalar(this.zoom);
    this.character.rotation.y = this.facing;

    if (this.mode === MODE_DRONE) {
      this.drone.position.copy(this.dronePos);
      this.drone.rotation.y += dt * 2;
      const s = Math.max(1, f.worldSize / 200) * 1.2;
      this.drone.scale.setScalar(s);
    }

    this._animate(dt);
  }

  _updateWalk(dt, input) {
    const f = this.field;
    const base = 4.2 * this.zoom * this.speedScale;
    const speed = base * (input.sprint ? 2.6 : 1);

    // Camera-relative movement, projected onto the horizontal plane.
    const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
    const fwdX = -sinY, fwdZ = -cosY;
    const rgtX = cosY, rgtZ = -sinY;

    let vx = fwdX * input.forward + rgtX * input.right;
    let vz = fwdZ * input.forward + rgtZ * input.right;
    const len = Math.hypot(vx, vz);
    if (len < 1e-6) { this.walkSpeed = 0; return; }
    vx /= len; vz /= len;

    const distWorld = speed * dt;
    // World displacement back into math units (uniform scale, so just divide).
    const nx = this.x + (vx * distWorld) / (f.S * f.sx);
    const ny = this.y - (vz * distWorld) / (f.S * f.sy);

    const cx = Math.max(f.xmin, Math.min(f.xmax, nx));
    const cy = Math.max(f.ymin, Math.min(f.ymax, ny));

    // Refuse to walk into a region where f is undefined; slide along instead.
    if (isFinite(f.height(cx, cy))) {
      this.x = cx; this.y = cy;
    } else if (isFinite(f.height(cx, this.y))) {
      this.x = cx;
    } else if (isFinite(f.height(this.x, cy))) {
      this.y = cy;
    }

    this.walkSpeed = speed;
    this.walkPhase += (distWorld / (0.85 * this.zoom)) * Math.PI;
    this.facing = Math.atan2(vx, vz) + Math.PI;
  }

  _updateDrone(dt, input) {
    const f = this.field;
    const speed = f.worldSize * (input.sprint ? 0.75 : 0.28);

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const fwd = new THREE.Vector3(-sy * cp, sp, -cy * cp);
    const rgt = new THREE.Vector3(cy, 0, -sy);

    this.dronePos.addScaledVector(fwd, input.forward * speed * dt);
    this.dronePos.addScaledVector(rgt, input.right * speed * dt);
    this.dronePos.y += input.up * speed * dt;

    // Stay above the ground, and inside a generous box around the plot.
    const mx = f.mathX(this.dronePos.x), my = f.mathY(this.dronePos.z);
    const gh = f.height(Math.max(f.xmin, Math.min(f.xmax, mx)), Math.max(f.ymin, Math.min(f.ymax, my)));
    const floor = f.worldY(isFinite(gh) ? gh : 0) + 1.2;
    if (this.dronePos.y < floor) this.dronePos.y = floor;

    const lim = Math.max(f.worldSize * 2.5, this._roam || 0);
    this.dronePos.x = Math.max(f.worldX(f.cx) - lim, Math.min(f.worldX(f.cx) + lim, this.dronePos.x));
    this.dronePos.z = Math.max(f.worldZ(f.cy) - lim, Math.min(f.worldZ(f.cy) + lim, this.dronePos.z));
    this.dronePos.y = Math.min(this.dronePos.y, lim * 1.5);
  }

  _animate(dt) {
    const p = this.character.userData.parts;
    const moving = (this.walkSpeed || 0) > 0 && this.mode !== MODE_DRONE && !this.frozen;
    const target = moving ? Math.sin(this.walkPhase) : 0;
    const swing = 0.75 * target;

    if (!p.stiffLegs) {
      p.legL.rotation.x = swing;
      p.legR.rotation.x = -swing;
    }
    p.armL.rotation.x = -swing * 0.8;
    p.armR.rotation.x = swing * 0.8;
    p.hips.position.y = 0.92 + (moving ? Math.abs(Math.sin(this.walkPhase)) * 0.045 : 0);

    if (this.mode === MODE_DRONE && this.drone.userData.rotors) {
      for (const r of this.drone.userData.rotors) r.rotation.y += dt * 40;
    }
    this.walkSpeed = 0;
  }

  /** Position the camera for the current mode. */
  updateCamera(camera, dt) {
    const f = this.field;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));

    if (this.mode === MODE_DRONE) {
      camera.position.copy(this.dronePos);
      camera.quaternion.copy(q);
    } else if (this.mode === MODE_FIRST) {
      const h = this.height();
      camera.position.set(
        f.worldX(this.x),
        f.worldY(isFinite(h) ? h : 0) + EYE_HEIGHT * this.zoom,
        f.worldZ(this.y),
      );
      camera.quaternion.copy(q);
    } else {
      // Over-the-shoulder third person: offset back, up, and slightly right.
      const dist = this.thirdDistance * this.zoom;
      const back = new THREE.Vector3(0, 0, 1).applyQuaternion(q).multiplyScalar(dist);
      const upOff = new THREE.Vector3(0, 1, 0).multiplyScalar(BODY_HEIGHT * 0.95 * this.zoom);
      const side = new THREE.Vector3(1, 0, 0).applyQuaternion(q).multiplyScalar(0.65 * this.zoom);

      const h = this.height();
      this._camTarget.set(
        f.worldX(this.x),
        f.worldY(isFinite(h) ? h : 0) + BODY_HEIGHT * 0.75 * this.zoom,
        f.worldZ(this.y),
      );
      this._camPos.copy(this._camTarget).add(back).add(upOff).add(side);

      // Do not let the camera sink under the terrain.
      const mx = f.mathX(this._camPos.x), my = f.mathY(this._camPos.z);
      const gh = f.height(Math.max(f.xmin, Math.min(f.xmax, mx)), Math.max(f.ymin, Math.min(f.ymax, my)));
      const minY = f.worldY(isFinite(gh) ? gh : 0) + 0.5 * this.zoom;
      if (this._camPos.y < minY) this._camPos.y = minY;

      if (!this._camReady) { this._smoothCam.copy(this._camPos); this._camReady = true; }
      // Frame-rate independent smoothing.
      const k = 1 - Math.exp(-dt * 14);
      this._smoothCam.lerp(this._camPos, k);

      camera.position.copy(this._smoothCam);
      camera.lookAt(this._camTarget);
    }

    // The near plane has to track the zoom. At 10^-4 scale the third-person
    // camera sits 0.5 mm from the explorer, so a fixed 1 mm near plane would
    // clip the character out of its own shot.
    camera.near = Math.max(1e-6, 0.02 * this.zoom);
    camera.far = f.worldSize * 12;
    camera.updateProjectionMatrix();
  }
}
