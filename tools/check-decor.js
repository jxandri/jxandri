// A curved surface is terrain too: it carries the bands and the forest, and
// the dial changes how big the forest is. Serve app/ on 8125 first.
const { chromium } = require('playwright-core');
let fails = 0;
const check = (n, ok, d) => { if (!ok) fails++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`); };

/** What is actually planted, and how big. */
const forest = (p) => p.evaluate(() => {
  const out = { layers: 0, instances: 0, tallest: 0 };
  const m = new (window.__peaks.THREE.Matrix4)();
  const s = new (window.__peaks.THREE.Vector3)();
  const q = new (window.__peaks.THREE.Quaternion)();
  const t = new (window.__peaks.THREE.Vector3)();
  window.__peaks.world.traverse((o) => {
    if (!o.isInstancedMesh || o.count === 0) return;
    out.layers++;
    out.instances += o.count;
    o.getMatrixAt(0, m);
    m.decompose(t, q, s);
    out.tallest = Math.max(out.tallest, s.x);
  });
  return out;
});

/** Does the surface carry terrain bands, or only the height ramp? */
const palette = (p) => p.evaluate(() => {
  const mesh = window.__peaks.altSurface;
  if (!mesh) return null;
  const c = mesh.geometry.getAttribute('color');
  if (!c) return null;
  const set = new Set();
  for (let i = 0; i < c.count; i += Math.max(1, Math.floor(c.count / 400))) {
    set.add([c.getX(i), c.getY(i), c.getZ(i)].map((v) => v.toFixed(2)).join(','));
  }
  return { distinct: set.size };
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

  for (const kind of ['parametric', 'implicit']) {
    await p.selectOption('#sel-surface', kind);
    await p.waitForTimeout(2600);

    const f = await forest(p);
    check(`${kind}: something grows on it`,
      f.layers >= 3 && f.instances > 200, JSON.stringify(f));

    const pal = await palette(p);
    // Terrain shading is many colours from noise-broken bands; a bare ramp
    // over a smooth surface gives far fewer. The point is that it is banded.
    check(`${kind}: the surface is painted as terrain`,
      pal && pal.distinct > 40, pal ? `${pal.distinct} distinct colours` : 'no colours');

    // The dial has to change the size and nothing else.
    await p.evaluate(() => document.getElementById('in-decsize').scrollIntoView({ block: 'center' }));
    await p.evaluate(() => {
      const el = document.getElementById('in-decsize');
      el.value = '0.7';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await p.waitForTimeout(2200);
    const big = await forest(p);
    check(`${kind}: the dial makes the trees bigger`,
      big.tallest > f.tallest * 3, `${f.tallest.toFixed(2)} → ${big.tallest.toFixed(2)}`);
    check(`${kind}: and plants the same forest`,
      Math.abs(big.instances - f.instances) < f.instances * 0.02,
      `${f.instances} → ${big.instances}`);

    await p.evaluate(() => {
      const el = document.getElementById('in-decsize');
      el.value = '0';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await p.waitForTimeout(2000);

    // And the switch still turns it off.
    await p.evaluate(() => document.getElementById('t-decor').click());
    await p.waitForTimeout(500);
    check(`${kind}: the vegetation switch still turns it off`,
      await p.evaluate(() => !window.__peaks.world.getObjectByName('decorations').visible));
    await p.evaluate(() => document.getElementById('t-decor').click());
    await p.waitForTimeout(500);
  }

  // A graph must be untouched by all of this.
  await p.selectOption('#sel-surface', 'graph');
  await p.waitForTimeout(2600);
  const g = await forest(p);
  check('graph: its own forest is still there', g.instances > 200, JSON.stringify(g));

  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(fails === 0 ? '\nCURVED SURFACES ARE TERRAIN TOO' : `\n${fails} FAILURE(S)`);
  process.exit(fails ? 1 : 0);
})();
