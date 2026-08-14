// The derivatives section has to work on a curved surface, from the panel.
const { chromium } = require('playwright-core');
let fails = 0;
const check = (n, ok, d) => { if (!ok) fails++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`); };

const seen = (p, name) => p.evaluate((n) => {
  // Walk the scene for a named object and report whether it is really visible
  // — every ancestor visible too, and something in its buffers.
  const app = window.__peaks;
  let found = null;
  app.scene.traverse((o) => { if (o.name === n) found = o; });
  if (!found) return { there: false };
  let vis = true;
  for (let o = found; o; o = o.parent) if (!o.visible) { vis = false; break; }
  let verts = 0;
  found.traverse((o) => {
    if (o.geometry && o.geometry.getAttribute('position') && o.visible) {
      verts += o.geometry.getAttribute('position').count;
    }
  });
  return { there: true, vis, verts };
}, name);

(async () => {
  const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
  });

  for (const kind of ['parametric', 'implicit']) {
    const ctx = await b.newContext({ viewport: { width: 1200, height: 820 } });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push('JS: ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
    await p.goto('http://127.0.0.1:8125/index.html', { waitUntil: 'load' });
    await p.waitForTimeout(2500);
    await p.selectOption('#sel-surface', kind);
    await p.waitForTimeout(2500);

    // The section must be live, not greyed.
    const live = await p.evaluate(() => {
      const s = document.getElementById('sec-deriv');
      document.getElementById('t-disc').scrollIntoView({ block: 'center' });
      const cs = getComputedStyle(s);
      const box = document.getElementById('t-disc').getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return { pe: cs.pointerEvents, op: cs.opacity, hit: hit ? hit.id || hit.tagName : null };
    });
    check(`${kind}: the derivatives section is clickable`,
      live.pe !== 'none' && parseFloat(live.op) > 0.9 && live.hit === 't-disc',
      JSON.stringify(live));

    // Gradient must be gone — there is no f to take one of.
    check(`${kind}: the ∇f row is not offered`,
      await p.evaluate(() => document.getElementById('row-grad').hidden));
    check(`${kind}: the labels say what they now mean`,
      (await p.textContent('#lbl-dir')).length > 3
      && !(await p.textContent('#lbl-dir')).includes('Directional'),
      await p.textContent('#lbl-dir'));

    await p.click('#t-disc');
    await p.waitForTimeout(900);
    const disc = await seen(p, 'geodesic-disc');
    check(`${kind}: the geodesic circle is drawn`,
      disc.there && disc.vis && disc.verts > 100, JSON.stringify(disc));

    await p.click('#t-dx'); await p.click('#t-dy'); await p.click('#t-dir');
    await p.click('#t-tangent');
    await p.waitForTimeout(900);
    const patch = await seen(p, 'tangent-patch');
    check(`${kind}: the tangent plane is drawn`,
      patch.there && patch.vis && patch.verts === 9, JSON.stringify(patch));

    const chips = await p.evaluate(() => ['c-dx', 'c-dy', 'c-dir', 'c-grad'].map((id) => {
      const el = document.getElementById(id);
      return { id, hidden: el.hidden, text: el.textContent.trim().slice(0, 40) };
    }));
    check(`${kind}: the readouts name the coordinate directions`,
      !chips[0].hidden && !chips[1].hidden && !chips[2].hidden && chips[3].hidden,
      chips.map((c) => `${c.id}:${c.hidden ? '—' : c.text}`).join(' | '));

    // And walking must not break any of it.
    await p.click('canvas');
    await p.keyboard.down('w');
    await p.waitForTimeout(1200);
    await p.keyboard.up('w');
    await p.waitForTimeout(600);
    const after = await seen(p, 'geodesic-disc');
    check(`${kind}: it survives a walk`, after.vis && after.verts > 100 && errs.length === 0,
      errs.slice(0, 2).join(' | ') || JSON.stringify(after));

    await p.screenshot({ path: `/tmp/claude-0/-home-user-jxandri/f0cc0bf2-0748-58e6-a991-f33d6b330a47/scratchpad/intrinsic-${kind}.png` });
    check(`${kind}: no errors on the console`, errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // And on a graph, the geodesic circle is an option rather than the default.
  {
    const ctx = await b.newContext({ viewport: { width: 1200, height: 820 } });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push('JS: ' + e.message));
    await p.goto('http://127.0.0.1:8125/index.html', { waitUntil: 'load' });
    await p.waitForTimeout(2500);
    check('graph: the ∇f row is still offered',
      !(await p.evaluate(() => document.getElementById('row-grad').hidden)));
    check('graph: the geodesic option is offered',
      !(await p.evaluate(() => document.getElementById('fld-geodisc').hidden)));
    await p.click('#t-disc');
    await p.waitForTimeout(800);
    check('graph: by default the compass-ray patch is what is drawn',
      (await seen(p, 'derivative-gizmo')).vis && !(await seen(p, 'geodesic-disc')).vis);
    await p.click('#t-geodisc');
    await p.waitForTimeout(1200);
    const g = await seen(p, 'geodesic-disc');
    check('graph: ticking it swaps in the geodesic circle',
      g.vis && g.verts > 100 && errs.length === 0,
      errs.slice(0, 2).join(' | ') || JSON.stringify(g));
    await p.screenshot({ path: '/tmp/claude-0/-home-user-jxandri/f0cc0bf2-0748-58e6-a991-f33d6b330a47/scratchpad/intrinsic-graph.png' });
    await ctx.close();
  }

  await b.close();
  console.log(fails === 0 ? '\nTHE DERIVATIVES SECTION WORKS ON EVERY SURFACE' : `\n${fails} FAILURE(S)`);
  process.exit(fails ? 1 : 0);
})();
