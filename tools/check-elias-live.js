// The Saint Elias preset, driven through the real page: the mountain builds,
// the boundary is the feasible set, the optimiser pins the constrained
// maximum to the line, and the palette turns alpine. Serve app/ on 8125.
const { chromium } = require('playwright-core');
let fails = 0;
const check = (n, ok, d) => { if (!ok) fails++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`); };

/** How much of the surface is painted as snow — bright, near-white pixels. */
const snowFraction = (p) => p.evaluate(() => {
  const mesh = window.__peaks.world.getObjectByName('surface');
  if (!mesh) return -1;
  const c = mesh.geometry.getAttribute('color');
  let snow = 0, n = 0;
  for (let i = 0; i < c.count; i += 7) {
    n++;
    if (c.getX(i) > 0.82 && c.getY(i) > 0.82 && c.getZ(i) > 0.82) snow++;
  }
  return snow / n;
});

(async () => {
  const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
  });

  for (const page of ['index.html', 'lab.html']) {
    const ctx = await b.newContext({ viewport: { width: 1100, height: 800 } });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push('JS: ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
    await p.goto('http://127.0.0.1:8125/' + page, { waitUntil: 'load' });
    await p.waitForTimeout(2200);

    const before = await snowFraction(p);

    await p.selectOption('#preset-fn', 'elias(x, y)');
    await p.waitForTimeout(3000);

    const got = await p.evaluate(() => ({
      fn: document.getElementById('in-fn').value,
      feas: document.getElementById('in-feas').value,
      feasOn: document.getElementById('t-feas').checked,
      followOff: !document.getElementById('t-follow').checked,
      xmin: parseFloat(document.getElementById('in-xmin').value),
      xmax: parseFloat(document.getElementById('in-xmax').value),
      note: !document.getElementById('note-elias').hidden,
      err: document.getElementById('err-fn').hidden,
      built: !!window.__peaks.world.getObjectByName('surface'),
    }));
    check(`${page}: the mountain builds from the preset`,
      got.built && got.err && got.fn === 'elias(x, y)', JSON.stringify(got).slice(0, 120));
    check(`${page}: the frontier is the feasible set, and the window holds still`,
      got.feasOn && got.followOff && /y <= -0\.35\d\d\*x - 0\.47\d\d/.test(got.feas), got.feas);
    check(`${page}: the domain is the survey window`,
      got.xmin === -30 && Math.abs(got.xmax - 10.05) < 1e-9, `[${got.xmin}, ${got.xmax}]`);
    check(`${page}: the note tells the story`, got.note);

    const after = await snowFraction(p);
    check(`${page}: the palette turned alpine — the massif is mostly snow and ice`,
      after > 0.35 && after > before + 0.2,
      `snow fraction ${(before * 100).toFixed(0)}% -> ${(after * 100).toFixed(0)}%`);

    // The punchline: press O, and the constrained maximum lands on the line.
    await p.evaluate(() => document.getElementById('t-opt').scrollIntoView({ block: 'center' }));
    await p.evaluate(() => document.getElementById('t-opt').click());
    await p.waitForTimeout(2500);
    const opt = await p.evaluate(() => window.__peaks.optimum);
    const line = opt ? Math.abs(opt.y - (-0.3509 * opt.x - 0.4707)) : 99;
    check(`${page}: the optimiser pins the highest point of Alaska to the boundary`,
      opt && line < 0.1 && opt.z > 4.5 && opt.z < 5.44,
      opt ? `(${opt.x.toFixed(2)}, ${opt.y.toFixed(2)}, ${(opt.z * 1000).toFixed(0)} m), ${(line * 1000).toFixed(0)} m off the line` : 'no optimum');

    // And you can still walk on it.
    await p.evaluate(() => document.querySelector('[data-mode="third"]').click());
    await p.waitForTimeout(500);
    const z0 = await p.evaluate(() => document.getElementById('r-z').textContent);
    await p.keyboard.down('w');
    await p.waitForTimeout(900);
    await p.keyboard.up('w');
    await p.waitForTimeout(300);
    const z1 = await p.evaluate(() => document.getElementById('r-z').textContent);
    check(`${page}: the explorer walks the real slope`, z0 !== z1, `${z0} -> ${z1}`);

    check(`${page}: no page errors`, errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  await b.close();
  console.log(fails === 0 ? '\nSAINT ELIAS STANDS, AND THE LESSON IS ON THE LINE' : `\n${fails} FAILURE(S)`);
  process.exit(fails ? 1 : 0);
})();
