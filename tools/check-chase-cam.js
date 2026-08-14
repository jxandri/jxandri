// Third person on a sphere: the camera rides behind the explorer, turns with
// them, and stays on this side of the surface however far you pull it back.
//
// The bug this pins down is geometric, so the checks are geometric: where the
// camera is relative to the explorer, and whether it is inside the sphere.
// Serve app/ on 8125 first.
const { chromium } = require('playwright-core');
let fails = 0;
const check = (n, ok, d) => { if (!ok) fails++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`); };

/** Where everything is, in world metres, straight off the scene graph. */
const look = (p) => p.evaluate(() => {
  const a = window.__peaks;
  const w = a.walker;
  if (!w) return null;
  const q = w.position(new (a.camera.position.constructor)());
  const fr = w.frame();
  const c = a.camera.position;
  const back = { x: c.x - q.x, y: c.y - q.y, z: c.z - q.z };
  const d = Math.hypot(back.x, back.y, back.z);
  return {
    dist: d,
    // Signed: how much of the camera's offset is *behind* the heading. Behind
    // is what "over the shoulder" means, and it is the thing that has to
    // survive a turn.
    behind: d > 0 ? -(back.x * fr.fwd.x + back.y * fr.fwd.y + back.z * fr.fwd.z) / d : 0,
    camR: Math.hypot(c.x, c.y, c.z),
    surfR: Math.hypot(q.x, q.y, q.z),
    heading: [fr.fwd.x, fr.fwd.y, fr.fwd.z],
    // The invariant that holds on any shape, not just a ball: nothing of the
    // surface stands between the explorer and the camera watching them.
    blocked: (() => {
      const head = q.clone().addScaledVector(fr.n, d * 0.02);
      const to = c.clone().sub(head);
      const len = to.length();
      if (!(len > 1e-6) || !a.altSurface) return false;
      const rc = new a.THREE.Raycaster(head, to.divideScalar(len), 0, len * 0.97);
      return rc.intersectObject(a.altSurface, false).length > 0;
    })(),
  };
});

(async () => {
  const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await b.newContext({ viewport: { width: 1100, height: 800 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('JS: ' + e.message));
  await p.goto('http://127.0.0.1:8125/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(2200);
  await p.selectOption('#sel-surface', 'parametric');   // the default is a sphere
  await p.waitForTimeout(2200);
  await p.evaluate(() => document.querySelector('[data-mode="third"]').click());
  await p.waitForTimeout(700);

  const a = await look(p);
  check('third person: the camera is behind the explorer',
    a && a.behind > 0.7, a ? `${(a.behind * 100).toFixed(0)}% behind` : 'no walker');
  check('third person: and outside the sphere they are standing on',
    a && a.camR > a.surfR, a ? `camera at ${a.camR.toFixed(1)}, surface at ${a.surfR.toFixed(1)}` : '');

  // Steering. The mouse turns the explorer, and the camera has to come round
  // with them — that is the whole complaint being fixed.
  await p.mouse.click(700, 450);          // pointer lock: the mouse is the look
  await p.waitForTimeout(400);
  await p.mouse.move(700, 450);
  await p.mouse.move(910, 450, { steps: 12 });
  await p.waitForTimeout(500);
  const c = await look(p);
  const turned = a && c
    ? Math.acos(Math.max(-1, Math.min(1,
      a.heading[0] * c.heading[0] + a.heading[1] * c.heading[1] + a.heading[2] * c.heading[2]))) : 0;
  check('third person: dragging the mouse steers the explorer',
    turned > 0.05, `heading turned ${(turned * 180 / Math.PI).toFixed(1)}°`);
  check('third person: and the camera stays behind them through the turn',
    c && c.behind > 0.7, c ? `${(c.behind * 100).toFixed(0)}% behind` : '');

  // Pulling back. However hard the wheel is turned, the camera must stay on
  // this side of the surface — the old one came out the far side.
  for (let i = 0; i < 14; i++) {
    await p.evaluate(() => document.getElementById('view').dispatchEvent(
      new WheelEvent('wheel', { deltaY: 400, deltaMode: 0, bubbles: true, cancelable: true })));
  }
  await p.waitForTimeout(600);
  const z = await look(p);
  check('zoomed all the way out: still outside the sphere',
    z && z.camR > z.surfR, z ? `camera at ${z.camR.toFixed(1)}, surface at ${z.surfR.toFixed(1)}` : '');
  check('zoomed all the way out: and still near the explorer',
    z && z.dist < z.surfR * 0.6, z ? `${z.dist.toFixed(1)} m away, radius ${z.surfR.toFixed(1)}` : '');
  check('zoomed all the way out: and still behind them',
    z && z.behind > 0.5, z ? `${(z.behind * 100).toFixed(0)}% behind` : '');
  check('zoomed all the way out: with a clear line to the explorer',
    z && !z.blocked, z ? (z.blocked ? 'the surface is in the way' : 'clear line') : '');

  // A torus is the harder case: there is a hole to fall into.
  await p.selectOption('#sel-shape', 'torus');
  await p.waitForTimeout(2200);
  await p.evaluate(() => document.querySelector('[data-mode="third"]').click());
  await p.waitForTimeout(700);
  await p.keyboard.down('w');
  await p.waitForTimeout(1400);
  await p.keyboard.up('w');
  await p.waitForTimeout(400);
  const tr = await look(p);
  check('torus: the camera follows a walk round the tube',
    tr && tr.behind > 0.6, tr ? `${(tr.behind * 100).toFixed(0)}% behind` : '');
  check('torus: and the tube never gets between it and the explorer',
    tr && !tr.blocked, tr ? (tr.blocked ? 'the surface is in the way' : 'clear line') : '');

  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await p.screenshot({ path: '/tmp/chase-cam.png' });
  await b.close();
  console.log(fails === 0 ? '\nTHE CHASE CAMERA STAYS WITH THE EXPLORER' : `\n${fails} FAILURE(S)`);
  process.exit(fails ? 1 : 0);
})();
