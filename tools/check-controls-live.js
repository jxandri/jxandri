// On a torus the grid controls must be reachable — clickable, not greyed.
// This is the exact failure the user hit: the section was disabled wholesale.
const { chromium } = require('playwright-core');
let fails = 0;
const check = (n, ok, d) => { if (!ok) fails++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`); };

const usable = (p, id) => p.evaluate((id) => {
  const el = document.getElementById(id);
  if (!el || el.offsetParent === null) return { ok: false, why: 'not on screen' };
  // Walk up: any ancestor with pointer-events none or a faded opacity kills it.
  let n = el, pe = null, op = 1;
  while (n && n !== document.body) {
    const cs = getComputedStyle(n);
    if (pe === null && cs.pointerEvents === 'none') pe = n.id || n.tagName;
    op *= parseFloat(cs.opacity);
    n = n.parentElement;
  }
  // And the browser's own answer: is this element what a click would reach?
  const r = el.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { ok: pe === null && op > 0.9 && !!hit && (el === hit || el.contains(hit) || hit.contains(el)),
           blockedBy: pe, opacity: +op.toFixed(2), hit: hit ? (hit.id || hit.tagName) : 'none' };
}, id);

(async () => {
  const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  for (const page of ['index.html', 'lab.html']) {
    const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
    const errs = [];
    p.on('pageerror', (e) => errs.push('JS: ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
    await p.goto('http://127.0.0.1:8125/' + page, { waitUntil: 'load' });
    await p.waitForTimeout(5500);

    for (const kind of ['graph', 'parametric', 'implicit']) {
      await p.selectOption('#sel-surface', kind);
      await p.waitForTimeout(kind === 'graph' ? 3000 : 4500);

      // Scroll the control into view, as a user would.
      await p.evaluate(() => document.getElementById('t-surfgrid').scrollIntoView({ block: 'center' }));
      await p.waitForTimeout(200);

      const grid = await usable(p, 't-surfgrid');
      check(`${page} / ${kind}: the grid toggle can be clicked`, grid.ok, JSON.stringify(grid));

      const scale = await p.evaluate(() => {
        document.getElementById('in-zoom').scrollIntoView({ block: 'center' });
      });
      await p.waitForTimeout(200);
      const sz = await usable(p, 'in-zoom');
      check(`${page} / ${kind}: the explorer scale dial can be dragged`, sz.ok, JSON.stringify(sz));

      // Actually click it and see the grid appear.
      await p.evaluate(() => document.getElementById('t-surfgrid').click());
      await p.waitForTimeout(kind === 'graph' ? 3000 : 4500);
      const on = await p.evaluate(() => ({
        checked: document.getElementById('t-surfgrid').checked,
        scale: document.getElementById('grid-scale').hidden
          ? null : document.getElementById('grid-scale').textContent,
        geo: !document.getElementById('fld-geogrid').hidden,
      }));
      check(`${page} / ${kind}: clicking it draws a grid and reports its size`,
        on.checked && !!on.scale, JSON.stringify(on));
      check(`${page} / ${kind}: the geodesic option shows only off graphs`,
        on.geo === (kind !== 'graph'), `geodesic toggle visible: ${on.geo}`);
      await p.evaluate(() => document.getElementById('t-surfgrid').click());
      await p.waitForTimeout(1200);
    }
    check(`${page}: no page errors`, errs.length === 0, errs.slice(0, 3).join(' | '));
    await p.close();
  }
  await b.close();
  console.log(fails === 0 ? '\nGRID CONTROLS ARE LIVE ON EVERY SURFACE' : `\n${fails} FAILURE(S)`);
  process.exit(fails ? 1 : 0);
})();
