// Four claims about looking at a real place.
//
//   1. The mouse turns the head on the real-terrain maps. It did not, and only
//      there: the Border Run offer card covered the middle of the screen and
//      swallowed the click that asks for the pointer, so the student clicked
//      the mountain and nothing happened.
//   2. The satellite drape is a texture, filtered, and comes out the colour the
//      ground is. It used to be sampled nearest-neighbour per mesh vertex, and
//      looked through the drone's own plumb beam, which put a cyan filter over
//      the whole frame in the cockpit view.
//   3. The campus carries a corner card: the photograph with its height washed
//      over it. Nothing else does.
//   4. Level curves take the heat ramp on every graph, blue at the bottom of
//      the window to red at the top — not the topographic ramp, in which a
//      hillside's worth of contours are all the same green.
const { chromium } = require('playwright-core');
const S = require('os').tmpdir() + '/';

const SLOPE = 'p49w0(x, y)';
const CAMPUS = 'uandes(x, y)';

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

  const load = async (preset) => {
    await p.goto('http://127.0.0.1:8125/index.html', { waitUntil: 'load' });
    await p.waitForFunction(() => window.__peaks && window.__peaks.player, null, { timeout: 30000 });
    if (preset) {
      await p.selectOption('#preset-fn', preset);
      await p.waitForTimeout(7000);
    }
    await p.waitForTimeout(1200);
  };

  /* --- 1. the mouse turns the head, offer card or no offer card --------- */

  await load(SLOPE);
  const offered = await p.evaluate(() => document.getElementById('game').dataset.screen === 'offer');
  say('a frontier slope offers the run', offered);

  // Click the middle of the screen: exactly where a student clicks the
  // mountain, and exactly where the card used to be.
  const before = await p.evaluate(() => window.__peaks.player.yaw);
  await p.mouse.click(640, 400);
  await p.waitForTimeout(300);
  const locked = await p.evaluate(() => !!document.pointerLockElement);
  await p.evaluate(() => {
    for (let i = 0; i < 20; i++) {
      document.dispatchEvent(new MouseEvent('mousemove', { movementX: 12, movementY: 0, bubbles: true }));
    }
  });
  await p.waitForTimeout(400);
  const after = await p.evaluate(() => window.__peaks.player.yaw);
  const dismissed = await p.evaluate(() => document.getElementById('game').dataset.screen);
  say('clicking the scene through the offer card takes the pointer', locked);
  say('and the mouse then turns the head', Math.abs(after - before) > 0.3,
    `yaw ${before.toFixed(3)} -> ${after.toFixed(3)}`);
  say('reaching for the scene puts the card away', dismissed === 'off', `screen "${dismissed}"`);

  /* --- 4. the level curves are the heat ramp ---------------------------- */

  await p.evaluate(() => {
    const c = document.getElementById('t-contours');
    if (!c.checked) c.click();
  });
  await p.waitForTimeout(2500);
  const ramp = await p.evaluate(() => {
    let m = null;
    window.__peaks.world.traverse((o) => { if (o.name === 'contours') m = o; });
    if (!m) return null;
    const c = m.geometry.getAttribute('color');
    const first = [c.getX(0), c.getY(0), c.getZ(0)];
    const last = [c.getX(c.count - 1), c.getY(c.count - 1), c.getZ(c.count - 1)];
    return { first, last };
  });
  say('the lowest contour is blue', ramp && ramp.first[2] > ramp.first[0] + 0.2,
    ramp && ramp.first.map((v) => v.toFixed(2)).join(','));
  say('the highest is warm', ramp && ramp.last[0] > ramp.last[2] + 0.2,
    ramp && ramp.last.map((v) => v.toFixed(2)).join(','));

  /* --- 2 and 3. the campus ---------------------------------------------- */

  await load(CAMPUS);

  const drape = await p.evaluate(() => {
    let surf = null;
    window.__peaks.world.traverse((o) => { if (o.name === 'surface') surf = o; });
    if (!surf) return null;
    const mats = Array.isArray(surf.material) ? surf.material : [surf.material];
    const t = mats[0].map;
    const uv = surf.geometry.getAttribute('uv');
    return {
      everyMaterialMapped: mats.every((m) => !!m.map),
      image: t && t.image ? [t.image.width, t.image.height] : null,
      linear: t ? t.magFilter === 1006 : false,        // THREE.LinearFilter
      mips: t ? t.minFilter === 1008 : false,          // LinearMipmapLinearFilter
      aniso: t ? t.anisotropy : 0,
      uv: !!uv,
    };
  });
  say('the ground is textured, both draw groups', drape && drape.everyMaterialMapped);
  say('the surface carries the parameterisation the map needs', drape && drape.uv);
  say('the photograph is filtered, not nearest', drape && drape.linear && drape.mips,
    drape && `${drape.image}, anisotropy ${drape.aniso}`);

  // The colour test. Put the drone's own camera at the aircraft — the cockpit
  // view, which is where the plumb beam used to enclose the lens — and look at
  // the ground. Santiago's foot slope in January is warm brown; anything that
  // comes back with more blue than red is a filter, not a photograph.
  await p.evaluate(() => {
    const a = window.__peaks, f = a.field;
    a.player.mode = 'drone';
    a.player.droneView = 'first';
    a.player.dronePos.set(f.worldX(f.cx), f.worldY(f.height(f.cx, f.cy)) + 60, f.worldZ(f.cy) + 90);
    a.player.yaw = 0; a.player.pitch = -0.45; a.player._camReady = false;
    document.getElementById('panel').hidden = true;
  });
  await p.waitForTimeout(2000);
  await p.screenshot({ path: S + 'satdrape-cockpit.png' });
  const shot = await p.screenshot({ clip: { x: 420, y: 420, width: 300, height: 200 } });
  const { PNG } = require('pngjs');
  const png = PNG.sync.read(shot);
  const n = png.width * png.height;
  const mean = [0, 1, 2].map((c) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += png.data[i * 4 + c];
    return Math.round(s / n);
  });
  say('the ground reads warm, as the ground is', mean[0] > mean[2] + 10, `mean rgb ${mean.join(',')}`);

  /* --- the corner card --------------------------------------------------- */

  const card = await p.evaluate(() => {
    const c = document.getElementById('sat-card');
    const cv = document.getElementById('sat-inset');
    if (!c || !cv) return null;
    const g = cv.getContext('2d');
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    let painted = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 8) painted++;
    return { hidden: c.hidden, w: cv.width, h: cv.height, painted, total: d.length / 4 };
  });
  say('the campus carries the corner card', card && !card.hidden);
  say('and it has actually been drawn', card && card.painted > card.total * 0.5,
    card && `${card.painted}/${card.total} pixels at ${card.w}x${card.h}`);

  await load(null);
  const elsewhere = await p.evaluate(() => {
    const c = document.getElementById('sat-card');
    return c ? c.hidden : 'missing';
  });
  say('and no other surface does', elsewhere === true, `hidden: ${elsewhere}`);

  /* --- the Lab: one map, on the left, carrying the photograph ------------ */

  await p.goto('http://127.0.0.1:8125/lab.html', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__peaks && window.__peaks.player, null, { timeout: 30000 });
  await p.selectOption('#preset-fn', CAMPUS);
  await p.waitForTimeout(8000);

  const lab = await p.evaluate(() => {
    const w = document.getElementById('proj-wrap');
    const c = document.getElementById('sat-card');
    const panel = document.getElementById('panel');
    const cv = document.getElementById('minimap');
    const r = w.getBoundingClientRect();
    const g = cv.getContext('2d');
    // Sample the flat map's own pixels. A photograph of a dry hillside has a
    // warm mean; the height ramp alone, pale-washed or not, does not.
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    let s = [0, 0, 0], n = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 8) continue; s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; n++; }
    return {
      projShown: !w.hidden,
      cardHidden: c.hidden,
      left: Math.round(r.left),
      right: Math.round(r.right),
      panelRight: Math.round(panel.getBoundingClientRect().right),
      width: window.innerWidth,
      mean: n ? s.map((v) => Math.round(v / n)) : null,
    };
  });
  say('the Lab shows one map and only one', lab && lab.projShown && lab.cardHidden);
  say('it is on the left, clear of the panel',
    lab && lab.left >= lab.panelRight && lab.right < lab.width / 2,
    lab && `panel ends ${lab.panelRight}, map ${lab.left}–${lab.right} of ${lab.width}`);
  say('and it is the photograph, not the ramp alone',
    lab && lab.mean && lab.mean[0] > lab.mean[2] + 12, lab && `mean rgb ${lab.mean.join(',')}`);

  const collapsed = await p.evaluate(async () => {
    document.getElementById('panel-toggle').click();
    await new Promise((r) => setTimeout(r, 700));
    return Math.round(document.getElementById('proj-wrap').getBoundingClientRect().left);
  });
  say('and it follows the panel when the panel folds away', collapsed < 40, `left ${collapsed}px`);

  say('no page errors', errs.length === 0, errs.join(' | '));
  console.log(ok ? '\nTHE PLACE IS THE PLACE, AND THE MOUSE TURNS THE HEAD' : '\nPROBLEMS');
  await b.close();
  process.exit(ok ? 0 : 1);
})();
