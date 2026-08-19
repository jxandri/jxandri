// The gamepad drives the explorer, on every kind of surface.
//
// A real controller cannot be plugged into a headless browser, but it does not
// need to be: the whole of gamepad.js talks to exactly one thing, the
// navigator.getGamepads() array, so a synthetic one substituted before the page
// loads exercises every line that matters — dead zone, curve, axis signs, the
// per-frame poll, and the wiring into movement, look and buttons. What is left
// untested is the hardware handshake itself, which belongs to the browser.
//
// Serve app/ on 8125 first.
const { chromium } = require('playwright-core');
let fails = 0;
const check = (n, ok, d) => { if (!ok) fails++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`); };

/** A standard-mapping pad the page can see, with axes and buttons we drive. */
const FAKE_PAD = `
  window.__pad = {
    id: 'Machenike Test Pad (STANDARD GAMEPAD)',
    index: 0, connected: true, mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
  };
  navigator.getGamepads = () => [window.__pad, null, null, null];
`;

const setAxes = (p, a) => p.evaluate((a) => { window.__pad.axes = a; }, a);
const tap = async (p, i) => {
  await p.evaluate((i) => { window.__pad.buttons[i] = { pressed: true, value: 1 }; }, i);
  await p.waitForTimeout(120);
  await p.evaluate((i) => { window.__pad.buttons[i] = { pressed: false, value: 0 }; }, i);
  await p.waitForTimeout(180);
};

/** Where the explorer is and which way they are looking, on any surface. */
const posture = (p) => p.evaluate(() => {
  const a = window.__peaks;
  if (a.state.surfaceKind !== 'graph') {
    const w = a.walker;
    if (!w) return null;
    const q = w.position(new a.THREE.Vector3());
    const f = w.frame();
    return { x: q.x, y: q.y, z: q.z, hx: f.fwd.x, hy: f.fwd.y, hz: f.fwd.z };
  }
  return { x: a.player.x, y: a.player.y, z: 0, hx: Math.cos(a.player.yaw), hy: 0, hz: Math.sin(a.player.yaw) };
});

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const turned = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.hx * b.hx + a.hy * b.hy + a.hz * b.hz)));

(async () => {
  const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await b.newContext({ viewport: { width: 1100, height: 800 } });
  await ctx.addInitScript(FAKE_PAD);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('JS: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
  await p.goto('http://127.0.0.1:8125/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(2500);

  check('the panel reports the controller by name',
    await p.evaluate(() => document.getElementById('pad-status').classList.contains('on')
      && /Machenike/.test(document.getElementById('pad-status').textContent)),
    await p.evaluate(() => document.getElementById('pad-status').textContent));

  // --- the dead zone -----------------------------------------------------
  await p.evaluate(() => document.querySelector('[data-mode="third"]').click());
  await p.waitForTimeout(400);
  {
    const before = await posture(p);
    await setAxes(p, [0.12, -0.12, 0, 0]);       // inside the 0.18 dead zone
    await p.waitForTimeout(900);
    const after = await posture(p);
    check('a stick resting off-centre does not creep',
      dist(before, after) < 1e-6, `drifted ${dist(before, after).toExponential(2)}`);
  }

  // --- walking -----------------------------------------------------------
  //
  // Against the keyboard rather than against a number. "A stick at the stop is
  // the same as holding W" is the actual contract, it is what a player expects,
  // and it stays true if the walking speed is ever retuned — where a hard
  // threshold would be a magic number in whatever units the domain happens to
  // use (0 to 2 by default, so a second's walk is 0.0095 of it).
  {
    let a0 = await posture(p);
    await p.keyboard.down('w');
    await p.waitForTimeout(1000);
    await p.keyboard.up('w');
    await p.waitForTimeout(250);
    const byKey = dist(a0, await posture(p));

    a0 = await posture(p);
    await setAxes(p, [0, -1, 0, 0]);             // left stick fully forward
    await p.waitForTimeout(1000);
    await setAxes(p, [0, 0, 0, 0]);
    await p.waitForTimeout(250);
    const byPad = dist(a0, await posture(p));

    check('graph: pushing the left stick forward walks', byPad > 0,
      `moved ${byPad.toFixed(5)}`);
    check('graph: and a stick at the stop is exactly holding W',
      byKey > 0 && Math.abs(byPad / byKey - 1) < 0.05,
      `pad ${byPad.toFixed(5)} against key ${byKey.toFixed(5)}`);

    const held = await posture(p);
    await p.waitForTimeout(600);
    check('graph: and letting go stops',
      dist(held, await posture(p)) < 1e-9);
  }

  // --- looking -----------------------------------------------------------
  {
    const before = await posture(p);
    await setAxes(p, [0, 0, 1, 0]);              // right stick fully right
    await p.waitForTimeout(700);
    await setAxes(p, [0, 0, 0, 0]);
    await p.waitForTimeout(250);
    const after = await posture(p);
    check('graph: pushing the right stick turns the view',
      turned(before, after) > 0.15, `turned ${(turned(before, after) * 180 / Math.PI).toFixed(1)}°`);
  }

  // --- buttons -----------------------------------------------------------
  {
    const was = await p.evaluate(() => document.getElementById('t-disc').checked);
    await tap(p, 1);                              // B
    check('B toggles the neighbourhood once per press',
      (await p.evaluate(() => document.getElementById('t-disc').checked)) !== was);

    // Held, not tapped: it must not flicker on and off every frame.
    await p.evaluate(() => { window.__pad.buttons[1] = { pressed: true, value: 1 }; });
    await p.waitForTimeout(700);
    const during = await p.evaluate(() => document.getElementById('t-disc').checked);
    await p.waitForTimeout(500);
    check('and holding it does not keep re-firing',
      (await p.evaluate(() => document.getElementById('t-disc').checked)) === during);
    await p.evaluate(() => { window.__pad.buttons[1] = { pressed: false, value: 0 }; });
    await p.waitForTimeout(200);
  }

  {
    const before = await p.evaluate(() => document.getElementById('r-mode').textContent);
    await tap(p, 0);                              // A
    check('A steps to the next view',
      (await p.evaluate(() => document.getElementById('r-mode').textContent)) !== before,
      `${before} → ${await p.evaluate(() => document.getElementById('r-mode').textContent)}`);
  }

  {
    const before = await p.evaluate(() => window.__peaks.state.zoom);
    await tap(p, 12);                             // D-pad up
    const after = await p.evaluate(() => window.__peaks.state.zoom);
    check('the D-pad resizes the explorer', Math.abs(after / before - 1.6) < 0.01,
      `${before.toFixed(3)} → ${after.toFixed(3)}`);
  }

  // --- a curved surface --------------------------------------------------
  await p.selectOption('#sel-surface', 'parametric');
  await p.waitForTimeout(2600);
  await p.evaluate(() => document.querySelector('[data-mode="third"]').click());
  await p.waitForTimeout(500);
  {
    const before = await posture(p);
    await setAxes(p, [0, -1, 0, 0]);
    await p.waitForTimeout(900);
    await setAxes(p, [0, 0, 0, 0]);
    await p.waitForTimeout(300);
    const after = await posture(p);
    check('sphere: the left stick walks there too',
      before && after && dist(before, after) > 0.5, `moved ${dist(before, after).toFixed(2)}`);

    const mid = await posture(p);
    await setAxes(p, [0, 0, 1, 0]);
    await p.waitForTimeout(700);
    await setAxes(p, [0, 0, 0, 0]);
    await p.waitForTimeout(250);
    check('sphere: and the right stick turns the heading',
      turned(mid, await posture(p)) > 0.15,
      `turned ${(turned(mid, await posture(p)) * 180 / Math.PI).toFixed(1)}°`);
  }

  // --- invert, and its memory --------------------------------------------
  await p.selectOption('#sel-surface', 'graph');
  await p.waitForTimeout(2500);
  {
    const pitchOf = () => p.evaluate(() => window.__peaks.player.pitch);
    const p0 = await pitchOf();
    await setAxes(p, [0, 0, 0, -1]);              // right stick pushed up
    await p.waitForTimeout(600);
    await setAxes(p, [0, 0, 0, 0]);
    const up = await pitchOf();
    check('the right stick pushed up looks up', up > p0, `${p0.toFixed(3)} → ${up.toFixed(3)}`);

    await p.evaluate(() => document.getElementById('t-padinvert').scrollIntoView({ block: 'center' }));
    await p.evaluate(() => document.getElementById('t-padinvert').click());
    await p.waitForTimeout(200);
    const p1 = await pitchOf();
    await setAxes(p, [0, 0, 0, -1]);
    await p.waitForTimeout(600);
    await setAxes(p, [0, 0, 0, 0]);
    check('and inverted, the same push looks down',
      (await pitchOf()) < p1, `${p1.toFixed(3)} → ${(await pitchOf()).toFixed(3)}`);
  }

  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(2500);
  check('the invert setting survives a reload',
    await p.evaluate(() => document.getElementById('t-padinvert').checked));

  // --- unplugged ---------------------------------------------------------
  await p.evaluate(() => { navigator.getGamepads = () => [null, null, null, null]; });
  await p.waitForTimeout(400);
  check('unplugging it is noticed, and stops everything',
    await p.evaluate(() => !document.getElementById('pad-status').classList.contains('on')));
  {
    const before = await posture(p);
    await p.waitForTimeout(600);
    check('with no pad, nothing moves on its own', dist(before, await posture(p)) < 1e-9);
  }

  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(fails === 0 ? '\nTHE GAMEPAD DRIVES THE EXPLORER' : `\n${fails} FAILURE(S)`);
  process.exit(fails ? 1 : 0);
})();
