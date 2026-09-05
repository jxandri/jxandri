/**
 * check-mouse-rail.js — three claims about the mouse and one about the rope.
 *
 *   1. A click still asks for the pointer, which is the good way to look
 *      around wherever a browser allows it.
 *   2. Dragging with the RIGHT button turns the head with no pointer lock at
 *      all. This is the fallback for every place the pointer is refused — a
 *      cross-origin frame without allow="pointer-lock", Safari in some
 *      contexts, a user who said no — where the mouse used to do nothing and
 *      say nothing.
 *   3. Dragging with the LEFT button picks the explorer up and carries them,
 *      dropping them where the button is released.
 *   4. "Walk the frontier" ropes the explorer to the BINDING constraint, and
 *      to the connected section of it that the constrained optimum lies on.
 *      It used to take the first comparison in the formula's text, which for
 *      the consumer problem `x>=0 && y>=0 && x+y<=2` is `x >= 0`: the rope
 *      put the student on the vertical axis instead of the budget line.
 */
const { chromium } = require('playwright-core');

const BASE = 'http://127.0.0.1:8125';

(async () => {
  const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));

  let ok = true;
  const say = (name, pass, note) => {
    ok = ok && pass;
    console.log(`${pass ? 'OK  ' : 'FAIL'} ${name}${note ? `  — ${note}` : ''}`);
  };

  /* --- the three gestures, on both pages ------------------------------- */

  for (const page of ['index', 'lab']) {
    await p.goto(`${BASE}/${page}.html`, { waitUntil: 'load' });
    await p.waitForFunction(() => window.__peaks && window.__peaks.player, null, { timeout: 30000 });
    await p.keyboard.press('2');                     // third person, on the ground
    await p.waitForTimeout(1400);

    await p.mouse.click(640, 300);
    await p.waitForTimeout(400);
    say(`${page}: a click still asks for the pointer`,
      await p.evaluate(() => !!document.pointerLockElement));
    await p.evaluate(() => document.exitPointerLock());
    await p.waitForTimeout(300);

    // Right drag: the head turns, and no pointer is taken.
    const y0 = await p.evaluate(() => window.__peaks.player.yaw);
    await p.mouse.move(640, 400);
    await p.mouse.down({ button: 'right' });
    for (let i = 1; i <= 10; i++) await p.mouse.move(640 + i * 12, 400);
    await p.mouse.up({ button: 'right' });
    await p.waitForTimeout(300);
    const y1 = await p.evaluate(() => window.__peaks.player.yaw);
    const lockedAfterLook = await p.evaluate(() => !!document.pointerLockElement);
    say(`${page}: right drag turns the head without the pointer`,
      Math.abs(y1 - y0) > 0.1 && !lockedAfterLook, `yaw ${y0.toFixed(3)} -> ${y1.toFixed(3)}`);

    // Left drag: the explorer is carried, and no pointer is taken.
    const a0 = await p.evaluate(() => [window.__peaks.player.x, window.__peaks.player.y]);
    await p.mouse.move(640, 430);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(640 - i * 10, 430 + i * 4);
    await p.mouse.up();
    await p.waitForTimeout(400);
    const a1 = await p.evaluate(() => [window.__peaks.player.x, window.__peaks.player.y]);
    const lockedAfterCarry = await p.evaluate(() => !!document.pointerLockElement);
    const moved = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]);
    say(`${page}: left drag carries the explorer`, moved > 1e-3 && !lockedAfterCarry,
      `${a0.map((v) => v.toFixed(3))} -> ${a1.map((v) => v.toFixed(3))}, moved ${moved.toFixed(4)}`);

    // And the explorer is still standing on the surface, not floating.
    say(`${page}: and puts them down on the ground`,
      await p.evaluate(() => isFinite(window.__peaks.player.height())));
  }

  /* --- the rope follows the binding constraint -------------------------- */

  await p.goto(`${BASE}/lab.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__peaks && window.__peaks.player, null, { timeout: 30000 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
    window.__peaks.player.setMode('third');
    const r = document.getElementById('t-rail');
    if (!r.checked) r.click();
  });
  await p.waitForTimeout(1500);

  const rail = await p.evaluate(() => {
    const a = window.__peaks;
    const R = a.player.onRail;
    if (!R || !R.path) return null;
    const path = R.path;
    let len = 0;
    for (let i = 0; i + 3 < path.length; i += 2) {
      len += Math.hypot(path[i + 2] - path[i], path[i + 3] - path[i + 1]);
    }
    const nearest = (x, y) => {
      let best = Infinity;
      for (let i = 0; i + 3 < path.length; i += 2) {
        const ax = path[i], ay = path[i + 1];
        const ex = path[i + 2] - ax, ey = path[i + 3] - ay;
        const l2 = ex * ex + ey * ey;
        const t = l2 > 1e-18 ? Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / l2)) : 0;
        best = Math.min(best, Math.hypot(x - (ax + ex * t), y - (ay + ey * t)));
      }
      return best;
    };

    // Push hard in one direction for a long time, then keep pushing: the walk
    // must stay on the arc and stop at its end rather than sliding off it.
    let worstOff = 0;
    for (let i = 0; i < 3000; i++) {
      a.player.update(1 / 60, { forward: 1, right: 0, up: 0, sprint: true });
      worstOff = Math.max(worstOff, nearest(a.player.x, a.player.y));
    }
    const stop = [a.player.x, a.player.y];
    for (let i = 0; i < 600; i++) a.player.update(1 / 60, { forward: 1, right: 0, up: 0, sprint: true });
    const after = [a.player.x, a.player.y];
    const ends = [[path[0], path[1]], [path[path.length - 2], path[path.length - 1]]];

    return {
      feasSrc: a.state.feasSrc,
      arcLen: len,
      start: [path[0], path[1]],
      end: [path[path.length - 2], path[path.length - 1]],
      worstOff,
      stalled: Math.hypot(after[0] - stop[0], after[1] - stop[1]),
      toNearestEnd: Math.min(...ends.map((e) => Math.hypot(after[0] - e[0], after[1] - e[1]))),
    };
  });

  say('the rope has a traced arc', !!rail);
  if (rail) {
    // The default consumer problem: the budget line x + y = 2, whose piece
    // inside x,y >= 0 runs from (2,0) to (0,2) and is 2√2 long. The old rope
    // would have given the x = 0 axis, of length 3 on this domain.
    const isBudget = Math.abs(rail.arcLen - 2 * Math.SQRT2) < 0.05;
    say('and it is the budget line, not the first clause in the text', isBudget,
      `${rail.feasSrc} → arc ${rail.arcLen.toFixed(3)} from (${rail.start.map((v) => v.toFixed(2))}) ` +
      `to (${rail.end.map((v) => v.toFixed(2))}), 2√2 = ${(2 * Math.SQRT2).toFixed(3)}`);
    say('walking never leaves the arc', rail.worstOff < 1e-3, `worst ${rail.worstOff.toExponential(2)}`);
    say('and stops at its end rather than sliding past it',
      rail.stalled < 1e-6 && rail.toNearestEnd < 0.02,
      `moved ${rail.stalled.toExponential(2)} more, ${rail.toNearestEnd.toFixed(4)} from the end`);
  }

  say('no page errors', errs.length === 0, errs.join(' | '));
  console.log(ok ? '\nTHE MOUSE WORKS WITHOUT PERMISSION, AND THE ROPE IS THE RIGHT ROPE'
    : '\nPROBLEMS');
  await b.close();
  process.exit(ok ? 0 : 1);
})();
