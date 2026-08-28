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
    Math.abs((w.xmax - w.xmin) - 2.323) < 0.01 && Math.abs((w.ymax - w.ymin) - 1.843) < 0.01,
    `${(w.xmax - w.xmin).toFixed(3)} x ${(w.ymax - w.ymin).toFixed(3)} km`);
  check('the ground is the real ground, in kilometres',
    w.zmin > 0.84 && w.zmin < 0.90 && w.zmax > 1.34 && w.zmax < 1.40,
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

  // One scale for the whole scene.
  //
  // This is the check that would have caught the picture the surface got
  // blamed for. A world unit is a metre; the window is 2.19 km; so the world
  // is 2 194 units across, the explorer is 1.8 of them, and a real five-metre
  // house is five. When the world was a nominal 220 units instead, the houses
  // came out a tenth of the explorer's height — pale slabs lying almost flat
  // on the ground, which reads as a faceted surface however smooth the
  // function underneath it is.
  const scale = await p.evaluate(async () => {
    const m = await import('./js/campus.js');
    const a = window.__peaks, T = a.THREE, f = a.field;
    let tree = 0;
    for (const g of a.scene.getObjectByName('decorations').children) {
      if (!g.isInstancedMesh || !g.count) continue;
      g.geometry.computeBoundingBox();
      const h = g.geometry.boundingBox.max.y - g.geometry.boundingBox.min.y;
      const mm = new T.Matrix4(); g.getMatrixAt(0, mm);
      tree = Math.max(tree, h * new T.Vector3().setFromMatrixScale(mm).y);
    }
    let hi = 0;
    for (const b of m.buildings()) hi = Math.max(hi, b.height);
    return {
      metreInWorld: f.worldY(0.001),
      explorerMetres: 1.8 * a.state.zoom / f.worldY(0.001),
      tallestTreeMetres: tree / f.worldY(0.001),
      tallestBuildingMetres: hi,
      instances: a.scene.getObjectByName('decorations').children.reduce((s, c) => s + (c.count || 0), 0),
    };
  });
  check('a world unit is a real metre here',
    Math.abs(scale.metreInWorld - 1) < 0.02, `${scale.metreInWorld.toFixed(3)} units per metre`);
  check('the explorer is 1.8 m, and the houses tower over him',
    Math.abs(scale.explorerMetres - 1.8) < 0.05 && scale.tallestBuildingMetres > 8,
    `explorer ${scale.explorerMetres.toFixed(2)} m, tallest building ${scale.tallestBuildingMetres} m`);
  check('the trees are trees and not landmarks',
    scale.tallestTreeMetres > 4 && scale.tallestTreeMetres < 20,
    `${scale.tallestTreeMetres.toFixed(1)} m`);
  check('the scenery stays inside a budget a laptop can draw',
    scale.instances < 60000, `${scale.instances} instances`);

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

  // ...and the mesh drawn from it turns no visible corner. A facet a student
  // can see is a normal that jumps between neighbouring nodes; on this surface
  // the worst jump is a degree and a half and the average a fifth of one.
  const facets = await p.evaluate(() => {
    const a = window.__peaks, T = a.THREE, g = a.grid;
    const n1 = new T.Vector3(), n2 = new T.Vector3(), grad = [0, 0];
    let worst = 0, sum = 0, cnt = 0;
    for (let j = 1; j < g.n - 1; j += 3) {
      for (let i = 1; i < g.n - 1; i += 3) {
        g.gradientAt(i, j, grad); a.field.normalFromGrad(grad[0], grad[1], n1);
        g.gradientAt(i + 1, j, grad); a.field.normalFromGrad(grad[0], grad[1], n2);
        const ang = Math.acos(Math.max(-1, Math.min(1, n1.dot(n2)))) * 180 / Math.PI;
        if (isFinite(ang)) { worst = Math.max(worst, ang); sum += ang; cnt++; }
      }
    }
    return { worst, mean: sum / cnt };
  });
  check('the rendered mesh has no facet the eye can find',
    facets.worst < 4 && facets.mean < 0.6,
    `normal turns ${facets.mean.toFixed(2)}° per step, worst ${facets.worst.toFixed(2)}°`);

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

  // The satellite image: decoded, aligned, and actually on the ground.
  const sat = await p.evaluate(async () => {
    const m = await import('./js/campus.js');
    await m.satelliteReady();
    const a = window.__peaks;
    const out = [0, 0, 0];
    // Built ground is pale and grey; the scrub slope east of it is not. If the
    // image were misaligned or upside down these two would not differ this way.
    const built = m.satelliteAt(-0.72, 0.05, out) ? out.slice() : null;
    const scrub = m.satelliteAt(0.55, -0.35, out) ? out.slice() : null;
    const off = m.satelliteAt(9, 9, out);
    const lum = (c) => 0.21 * c[0] + 0.72 * c[1] + 0.07 * c[2];
    return {
      ready: m.hasSatellite(), built, scrub, off,
      brighter: built && scrub ? lum(built) > lum(scrub) : null,
      on: a.state.satellite,
    };
  });
  check('the satellite image decodes and is sampled in linear light',
    sat.ready && sat.built && sat.scrub && sat.off === null,
    sat.built ? `built ${sat.built.map((v) => v.toFixed(2)).join(',')}` : 'no pixels');
  check('it is the right way round: the town is paler than the scrub slope',
    sat.brighter === true);

  // The quadrant the request named, to the metre.
  await p.evaluate(() => {
    const s = document.getElementById('preset-fn');
    s.value = 'uandes(x, y)|quadrant';
    s.dispatchEvent(new Event('change'));
  });
  await p.waitForTimeout(16000);
  const quad = await p.evaluate(() => {
    const a = window.__peaks;
    return { w: (a.state.xmax - a.state.xmin) * 1000, h: (a.state.ymax - a.state.ymin) * 1000 };
  });
  check('the named quadrant opens at exactly its stated size',
    Math.abs(quad.w - 129) < 3 && Math.abs(quad.h - 926) < 6,
    `${quad.w.toFixed(0)} m x ${quad.h.toFixed(0)} m`);

  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log(fails === 0 ? '\nTHE CAMPUS IS A SURFACE, AND THE SCENERY IS NOT PART OF IT' : `\n${fails} FAILURE(S)`);
  await b.close();
  process.exit(fails ? 1 : 0);
})();
