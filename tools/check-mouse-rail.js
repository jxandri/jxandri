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
 *   3. Dragging the explorer happens on the FLAT MAP, not on the scene. The
 *      scene keeps the gesture it always had — left click asks for the
 *      pointer — so nothing a student already knows changed; the map is where
 *      you pick somebody up and put them down, with the whole domain in view.
 *   5. The tangent plane is cut at the constraint. A plane hanging out past
 *      the budget line describes steps the consumer cannot take.
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

    // Left drag on the SCENE must leave the explorer exactly where they were:
    // that gesture belongs to the camera, and the carry lives on the map.
    const a0 = await p.evaluate(() => [window.__peaks.player.x, window.__peaks.player.y]);
    await p.mouse.move(640, 430);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(640 - i * 10, 430 + i * 4);
    await p.mouse.up();
    await p.waitForTimeout(400);
    const a1 = await p.evaluate(() => [window.__peaks.player.x, window.__peaks.player.y]);
    const moved = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]);
    say(`${page}: left drag on the scene does not move the explorer`, moved < 1e-9,
      `${a0.map((v) => v.toFixed(3))} -> ${a1.map((v) => v.toFixed(3))}`);
    await p.evaluate(() => document.exitPointerLock());
    await p.waitForTimeout(250);
  }

  /* --- carrying, on the flat map --------------------------------------- */

  await p.goto(`${BASE}/lab.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__peaks && window.__peaks.player, null, { timeout: 30000 });
  await p.waitForTimeout(1400);

  const box = await p.evaluate(() => {
    const r = document.getElementById('minimap').getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  say('the flat map is on screen to drag on', box.w > 40 && box.h > 40,
    `${Math.round(box.w)}x${Math.round(box.h)} at ${Math.round(box.x)},${Math.round(box.y)}`);

  // A quarter along and a quarter up: the map's y runs up the panel, the
  // opposite way to the canvas', so the cursor goes three quarters down it.
  await p.mouse.move(box.x + box.w * 0.5, box.y + box.h * 0.5);
  await p.mouse.down();
  await p.mouse.move(box.x + box.w * 0.25, box.y + box.h * 0.75, { steps: 10 });
  await p.mouse.up();
  await p.waitForTimeout(400);

  const carried = await p.evaluate(() => {
    const a = window.__peaks, f = a.field;
    return {
      x: a.player.x, y: a.player.y, mode: a.player.mode,
      wantX: f.xmin + 0.25 * (f.xmax - f.xmin),
      wantY: f.ymin + 0.25 * (f.ymax - f.ymin),
      span: Math.max(f.xmax - f.xmin, f.ymax - f.ymin),
      onGround: isFinite(a.player.height()),
      locked: !!document.pointerLockElement,
    };
  });
  const err = Math.hypot(carried.x - carried.wantX, carried.y - carried.wantY) / carried.span;
  say('dragging the map puts the explorer at that point of the domain', err < 0.02,
    `(${carried.x.toFixed(3)}, ${carried.y.toFixed(3)}) vs ` +
    `(${carried.wantX.toFixed(3)}, ${carried.wantY.toFixed(3)}), ${(err * 100).toFixed(1)}% of the window`);
  say('and puts them down on the ground, on foot', carried.onGround && carried.mode === 'third');
  say('and never asks for the pointer while doing it', !carried.locked);

  /* --- the tangent plane stops at the constraint ------------------------ */

  const plane = await p.evaluate(async () => {
    const a = window.__peaks, f = a.field;
    document.getElementById('t-tangent').click();
    a.player.x = 1.2; a.player.y = 0.8;            // exactly on x + y = 2
    await new Promise((r) => setTimeout(r, 1400));
    let m = null;
    a.world.traverse((o) => {
      if (o.isMesh && o.material && o.material.color
        && o.material.color.getHexString() === 'ffe27a') m = o;
    });
    if (!m || !m.visible) return null;
    const pos = m.geometry.getAttribute('position');
    const used = new Set(m.geometry.getIndex().array);
    const r = f.arcRadius(a.player.x, a.player.y, 1, 0, a.state.radius * a.player.zoom * 1.6);
    let over = 0, maxSum = -Infinity;
    for (const k of used) {
      const s = f.mathX(pos.getX(k)) + f.mathY(pos.getZ(k));
      maxSum = Math.max(maxSum, s);
      if (s > 2 + r * 0.06) over++;              // allow the normal lift's own offset
    }
    return { verts: used.size, tris: m.geometry.getIndex().count / 3, over, maxSum, half: r };
  });
  say('the tangent plane is drawn', !!plane && plane.tris > 100);
  if (plane) {
    say('and no part of it is outside the feasible set', plane.over === 0,
      `${plane.verts} vertices, max x+y = ${plane.maxSum.toFixed(5)}`);
    // Standing on the line, roughly half the patch must survive: too few and
    // it is being over-clipped, too many and it is not being clipped at all.
    say('and it is cut, not merely shrunk', plane.tris > 3200 * 0.3 && plane.tris < 3200 * 0.7,
      `${plane.tris} of 3200 cells' triangles`);
    say('and it reaches the frontier rather than stopping short',
      plane.maxSum > 2 - plane.half * 0.1, `within ${(2 - plane.maxSum).toExponential(1)}`);
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
