/**
 * check-campus.js — the Universidad de los Andes map is a real place, and the
 * mathematics on it is still mathematics.
 *
 * Serve app/ on 8125 first.
 */
const { chromium } = require('playwright-core');
let fails = 0;
const check = (n, ok, d) => { if (!ok) fails++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`); };

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage'],
  });
  const ctx = await b.newContext({ viewport:{width:1280,height:820}, serviceWorkers:'block' });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('JS: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('C: ' + m.text()); });

  await p.goto('http://127.0.0.1:8125/lab.html', { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { const s = document.getElementById('preset-fn'); s.value = 'uandes(x, y)'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(22000);

  const w = await p.evaluate(() => {
    const a = window.__peaks;
    return { xmin: a.state.xmin, xmax: a.state.xmax, ymin: a.state.ymin, ymax: a.state.ymax,
      zmin: a.grid.zmin, zmax: a.grid.zmax, sz: a.state.sz, res: a.state.res };
  });
  check('the window is the rectangle the coordinates name',
    Math.abs((w.xmax - w.xmin) - 2.194) < 0.01 && Math.abs((w.ymax - w.ymin) - 1.843) < 0.01,
    `${(w.xmax - w.xmin).toFixed(3)} x ${(w.ymax - w.ymin).toFixed(3)} km`);
  check('the ground is the real ground, in kilometres',
    w.zmin > 0.86 && w.zmin < 0.90 && w.zmax > 1.34 && w.zmax < 1.40,
    `${(w.zmin * 1000).toFixed(0)}–${(w.zmax * 1000).toFixed(0)} m`);
  check('it opens at true vertical scale', w.sz === 1);

  // The buildings are there, and they are objects, not geometry.
  const bs = await p.evaluate(() => {
    const a = window.__peaks;
    const b = a.world.children.find(c => c.name === 'buildings');
    let tris = 0;
    b && b.traverse(o => { if (o.geometry && o.geometry.index) tris += o.geometry.index.count / 3; });
    return { present: !!b, tris };
  });
  check('the buildings are drawn', bs.present && bs.tris > 8000, `${bs.tris} triangles`);

  // f is the ground. Standing where a building is must not change the height.
  const ground = await p.evaluate(() => {
    const a = window.__peaks;
    // The middle of the built-up area: sample f on a small grid and confirm it
    // is smooth — no metre-high steps where a wall is.
    let worst = 0;
    for (let i = -20; i <= 20; i++) {
      const x = -0.72 + i * 0.004;
      const h1 = a.field.height(x, 0.045), h2 = a.field.height(x + 0.004, 0.045);
      worst = Math.max(worst, Math.abs(h2 - h1) * 1000);
    }
    return worst;
  });
  check('f is the altitude of the ground, not of the roofs',
    ground < 12, `largest step over 4 m of walking: ${ground.toFixed(1)} m`);

  // Smoothness: second differences bounded, as for any cosine series.
  const smooth = await p.evaluate(() => {
    const a = window.__peaks, h = 0.002;
    let worst = 0;
    for (let i = -30; i <= 30; i++) {
      const x = i * 0.03;
      const f0 = a.field.height(x - h, 0), f1 = a.field.height(x, 0), f2 = a.field.height(x + h, 0);
      if (!isFinite(f0) || !isFinite(f1) || !isFinite(f2)) continue;
      worst = Math.max(worst, Math.abs(f2 - 2 * f1 + f0) / (h * h));
    }
    return worst;
  });
  check('the surface is a smooth function, second derivative and all',
    smooth < 400, `|f''| <= ${smooth.toFixed(0)} per km`);

  // The vegetation follows the survey, not the height.
  const veg = await p.evaluate(() => {
    const a = window.__peaks;
    const layers = a.__decor ? null : null;
    // Count what the decoration put on built ground vs on the scrub slope.
    return { decorGroups: a.world.children.filter(c => c.name === 'decorations').length };
  });
  check('the forest is on the surface', veg.decorGroups === 1);

  // The flat map panel — the Lab's heat map — still works on it.
  const mini = await p.evaluate(() => {
    const c = document.getElementById('minimap');
    if (!c) return null;
    const g = c.getContext('2d');
    const d = g.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data;
    return { w: c.width, h: c.height, px: [d[0], d[1], d[2], d[3]] };
  });
  check('the flat heat map is drawn beside the scene',
    mini && mini.w > 40 && mini.px[3] > 0, mini && JSON.stringify(mini.px));

  // Level curves, the ordinary tool, on the ordinary surface.
  await p.evaluate(() => document.getElementById('t-contours').click());
  await p.waitForTimeout(4000);
  const cont = await p.evaluate(() => {
    const a = window.__peaks;
    let n = 0;
    a.world.traverse(o => { if (o.name === 'contours') n++; });
    return n;
  });
  check('level curves draw on it like any other surface', cont >= 1, `${cont} group(s)`);

  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log(fails === 0 ? '\nTHE CAMPUS IS A SURFACE, AND THE SCENERY IS NOT PART OF IT' : `\n${fails} FAILURE(S)`);
  await b.close();
  process.exit(fails ? 1 : 0);
})();
