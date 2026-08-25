// Does the graph grid hug the rendered terrain on the Saint Elias model?
// Measures every sampled grid vertex against the mesh's own height there.
const { chromium } = require('playwright-core');
const S = require('os').tmpdir() + '/';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage'] });
  const p = await (await b.newContext({viewport:{width:1200,height:820}})).newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto('http://127.0.0.1:8125/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(2200);
  await p.selectOption('#preset-fn', 'elias(x, y)');
  await p.waitForTimeout(3200);
  await p.evaluate(() => { document.getElementById('t-surfgrid').click(); });
  await p.waitForTimeout(1000);
  await p.evaluate(() => { document.getElementById('t-contours').click(); });
  await p.waitForTimeout(2500);

  const info = await p.evaluate(() => {
    const a = window.__peaks;
    const f = a.field, g = a.grid;
    const out = { charH: 1.8 * a.state.zoom };
    const measure = (obj, name) => {
      let worst = -Infinity, sum = 0, cnt = 0, below = 0;
      const geoms = [];
      obj.traverse((o) => { if (o.geometry) geoms.push(o.geometry); });
      for (const geom of geoms) {
        const arr = geom.getAttribute('position').array;
        const stride = Math.max(3, Math.floor(arr.length / 3 / 800) * 3);
        for (let i = 0; i + 2 < arr.length; i += stride) {
          const wx = arr[i], wy = arr[i + 1], wz = arr[i + 2];
          const mz = g.meshHeight(f.mathX(wx), f.mathY(wz));
          if (!isFinite(mz)) continue;
          const gap = wy - f.worldY(mz);       // + above the mesh, − below
          if (gap > worst) worst = gap;
          if (gap < -1e-6) below++;
          sum += Math.abs(gap); cnt++;
        }
      }
      out[name] = { worst: +worst.toFixed(3), mean: +(sum / Math.max(1, cnt)).toFixed(3), n: cnt, below };
    };
    const grid = a.world.getObjectByName('surface-grid');
    if (grid) measure(grid, 'grid');
    const cont = a.world.getObjectByName('contours');
    if (cont) measure(cont, 'contours');
    const walls = a.world.getObjectByName('feasible-walls');
    if (walls) {
      // walls extrude up on purpose; check only their feet (every 1st+2nd vertex of each quad)
      const arr = walls.geometry.getAttribute('position').array;
      let worst = -Infinity, cnt = 0;
      for (let q = 0; q + 11 < arr.length; q += 12) {
        for (const o of [0, 3]) {
          const wx = arr[q + o], wy = arr[q + o + 1], wz = arr[q + o + 2];
          const mz = g.meshHeight(f.mathX(wx), f.mathY(wz));
          if (!isFinite(mz)) continue;
          const gap = wy - f.worldY(mz);
          if (Math.abs(gap) > worst) worst = Math.abs(gap);
          cnt++;
        }
      }
      out.wallFeet = { worst: +worst.toFixed(3), n: cnt };
    }
    return out;
  });
  console.log(JSON.stringify(info, null, 1));
  console.log('pageerrors:', errs.length ? errs : 'none');

  // The claims: overlays hug the rendered terrain to within a fraction of the
  // explorer's height. Before the drape fix the grid hung about a metre up.
  const H = info.charH;
  let ok = errs.length === 0;
  const say = (name, pass) => { ok = ok && pass; console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}`); };
  say('grid lines stay within a third of the explorer', info.grid && info.grid.worst < H * 0.34);
  say('grid mean gap is the deliberate lift, not a float', info.grid && info.grid.mean < H * 0.12);
  say('contours ride at their lift and never sink', info.contours && info.contours.worst < H * 0.2 && info.contours.below === 0);
  say('feasible walls stand exactly on the mesh', info.wallFeet && info.wallFeet.worst < 1e-6);

  // third-person shot for the eye test
  await p.evaluate(() => document.querySelector('[data-mode="third"]').click());
  await p.waitForTimeout(900);
  await p.evaluate(() => document.getElementById('panel-toggle').click());
  await p.waitForTimeout(500);
  await p.screenshot({ path: S + 'drape-third.png' });
  console.log(ok ? 'THE OVERLAYS LIE ON THE MOUNTAIN' : 'PROBLEMS');
  await b.close();
  process.exit(ok ? 0 : 1);
})();
