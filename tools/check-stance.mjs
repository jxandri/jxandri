/**
 * check-stance.mjs — the explorer is a rigid body.
 *
 * Walking over a torus may translate the character and rotate it and nothing
 * else. The way that breaks is subtle: three orthonormal columns in the wrong
 * order give a matrix of determinant −1, a reflection rather than a rotation,
 * and Three's quaternion extraction — which assumes a rotation — then returns
 * something unrelated to the stance and not even unit, so the character is
 * genuinely distorted and the distortion changes as it moves.
 *
 * That is checked here on the transform rather than on a screenshot, over 1440
 * stances on three surfaces including a non-orientable one, because a
 * reflection looks perfectly plausible in a single still frame.
 *
 *   node tools/check-stance.mjs
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const THREE = await import(join(here, '../app/vendor/three.module.js'));
const { ParametricWalker, standBasis } = await import(join(here, '../app/js/walker.js'));

let fails = 0;
const check = (n, ok, d) => { if (!ok) fails++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`); };

const det3 = (m) => {
  const e = m.elements;
  return e[0] * (e[5] * e[10] - e[6] * e[9])
       - e[4] * (e[1] * e[10] - e[2] * e[9])
       + e[8] * (e[1] * e[6] - e[2] * e[5]);
};

const SURFACES = {
  torus: {
    X: (u, v) => (1 + 0.4 * Math.cos(v)) * Math.cos(u),
    Y: (u, v) => (1 + 0.4 * Math.cos(v)) * Math.sin(u),
    Z: (u, v) => 0.4 * Math.sin(v),
    opts: { umin: 0, umax: 2 * Math.PI, vmin: 0, vmax: 2 * Math.PI, wrapU: true, wrapV: true },
  },
  sphere: {
    X: (u, v) => Math.cos(u) * Math.sin(v),
    Y: (u, v) => Math.sin(u) * Math.sin(v),
    Z: (u, v) => Math.cos(v),
    opts: { umin: 0, umax: 2 * Math.PI, vmin: 0.15, vmax: Math.PI - 0.15, wrapU: true, wrapV: false },
  },
  mobius: {
    X: (u, v) => (1 + v * Math.cos(u / 2)) * Math.cos(u),
    Y: (u, v) => (1 + v * Math.cos(u / 2)) * Math.sin(u),
    Z: (u, v) => v * Math.sin(u / 2),
    opts: { umin: 0, umax: 2 * Math.PI, vmin: -0.35, vmax: 0.35, wrapU: true, wrapV: false },
  },
};

for (const [name, S] of Object.entries(SURFACES)) {
  const w = new ParametricWalker({ X: S.X, Y: S.Y, Z: S.Z },
    { ...S.opts, scale: 40, sx: 1, sy: 1, sz: 1 });

  let worstDet = 0, worstUp = 0, worstFace = 0, worstLen = 0, steps = 0;

  for (const sign of [1, -1]) {
    w.sign = sign;
    for (let lap = 0; lap < 240; lap++) {
      // Walk, turn, and strafe, so every attitude the surface offers is visited.
      w.turn(0.11);
      w.move(1.4, Math.cos(lap * 0.37), Math.sin(lap * 0.23));
      steps++;

      const fr = w.frame();
      const face = w.facing(fr);
      const up = fr.n;

      // The caller's orthogonalisation, as main.js does it.
      const f = face.clone().addScaledVector(up, -face.dot(up));
      if (f.lengthSq() < 1e-12) continue;
      f.normalize();

      const m = standBasis(up, f);
      worstDet = Math.max(worstDet, Math.abs(det3(m) - 1));

      // A rotation, applied to the model's own axes, must give back exactly the
      // stance that was asked for — and preserve lengths.
      const q = new THREE.Quaternion().setFromRotationMatrix(m);
      const gotUp = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      const gotFace = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
      const probe = new THREE.Vector3(0.3, -0.7, 0.5);
      const len0 = probe.length();
      worstLen = Math.max(worstLen, Math.abs(probe.clone().applyQuaternion(q).length() - len0));
      worstUp = Math.max(worstUp, gotUp.distanceTo(up));
      worstFace = Math.max(worstFace, gotFace.distanceTo(f));
    }
  }

  check(`${name}: the stance is a rotation (det = 1)`, worstDet < 1e-9, `worst |det−1| = ${worstDet.toExponential(2)} over ${steps} steps`);
  check(`${name}: it stands the explorer along the normal`, worstUp < 1e-9, `worst error ${worstUp.toExponential(2)}`);
  check(`${name}: it faces them the way they moved`, worstFace < 1e-9, `worst error ${worstFace.toExponential(2)}`);
  check(`${name}: lengths are preserved (no shear, no scaling)`, worstLen < 1e-12, `worst error ${worstLen.toExponential(2)}`);
}

console.log(fails === 0 ? '\nEXPLORER IS RIGID' : `\n${fails} FAILURE(S)`);
process.exit(fails ? 1 : 0);
