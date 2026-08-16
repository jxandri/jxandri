// Map & terrain has to be live on every kind of surface, except the pieces
// that are genuinely graph-only (level curves, water). Serve app/ on 8125.
const { chromium } = require('playwright-core');
let fails = 0;
const check = (n, ok, d) => { if (!ok) fails++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`); };

const usable = (p, id) => p.evaluate((id) => {
  const el = document.getElementById(id);
  if (!el || el.offsetParent === null) return { ok: false, why: 'not on screen' };
  let n = el, pe = null, op = 1;
  while (n && n !== document.body) {
    const cs = getComputedStyle(n);
    if (pe === null && cs.pointerEvents === 'none') pe = n.id || n.tagName;
    op = Math.min(op, parseFloat(cs.opacity));
    n = n.parentElement;
  }
  return { ok: pe === null && op > 0.9, blockedBy: pe, opacity: op };
}, id);

(async () => {
  const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await b.newContext({ viewport: { width: 1100, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('JS: ' + e.message));
  await p.goto('http://127.0.0.1:8125/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(2200);

  for (const kind of ['parametric', 'implicit']) {
    await p.selectOption('#sel-surface', kind);
    await p.waitForTimeout(2500);

    for (const id of ['t-worldmap', 't-decor', 'in-den', 'in-decsize', 't-heightcol', 't-shadow']) {
      await p.evaluate((id) => document.getElementById(id).scrollIntoView({ block: 'center' }), id);
      const r = await usable(p, id);
      check(`${kind}: #${id} is live`, r.ok, JSON.stringify(r));
    }

    check(`${kind}: the level-curve controls are hidden, not just greyed`,
      await p.evaluate(() => document.getElementById('fld-contours').hidden));
    check(`${kind}: the water toggle is hidden too — no lake on a closed surface`,
      await p.evaluate(() => document.getElementById('fld-water').hidden));

    // And they actually do something: click world map, then vegetation off.
    await p.click('#t-worldmap');
    await p.waitForTimeout(1200);
    const mapped = await p.evaluate(() => {
      const a = window.__peaks;
      const mats = Array.isArray(a.altSurface.material) ? a.altSurface.material : [a.altSurface.material];
      return mats.every((m) => !!m.map);
    });
    check(`${kind}: clicking it actually paints the map`, mapped);
    await p.click('#t-worldmap');
    await p.waitForTimeout(600);

    await p.click('#t-decor');
    await p.waitForTimeout(600);
    check(`${kind}: clicking vegetation off actually hides the forest`,
      await p.evaluate(() => !window.__peaks.world.getObjectByName('decorations').visible));
    await p.click('#t-decor');
    await p.waitForTimeout(600);
  }

  // A graph must keep everything, contours and water included.
  await p.selectOption('#sel-surface', 'graph');
  await p.waitForTimeout(2200);
  for (const id of ['t-contours', 'in-cwidth', 't-water', 't-worldmap', 't-decor', 'in-den', 'in-decsize']) {
    await p.evaluate((id) => document.getElementById(id).scrollIntoView({ block: 'center' }), id);
    const r = await usable(p, id);
    check(`graph: #${id} is still live`, r.ok, JSON.stringify(r));
  }
  check('graph: the contour block is visible', !(await p.evaluate(() => document.getElementById('fld-contours').hidden)));
  check('graph: the water toggle is visible', !(await p.evaluate(() => document.getElementById('fld-water').hidden)));

  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(fails === 0 ? '\nMAP & TERRAIN IS LIVE ON EVERY KIND OF SURFACE' : `\n${fails} FAILURE(S)`);
  process.exit(fails ? 1 : 0);
})();
