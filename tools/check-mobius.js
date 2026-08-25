// The Möbius lap gradient and the two-faced flag.
//  * default colours: white at the explorer's default start (u0), deepest blue
//    at the far side of the lap (u0 ± π), continuous over the seam
//  * a flag group at r(u0, 0): pole + blue pennant + white pennant on
//    opposite ends of the pole
//  * the height-ramp toggle still overrides the gradient, and switching
//    surfaces removes the flag
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

  // Parametric surfaces tab, Möbius shape.
  await p.evaluate(() => { const s = document.getElementById('sel-surface'); s.value = 'parametric'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(1200);
  await p.selectOption('#sel-shape', 'mobius');
  await p.waitForTimeout(2000);

  const r = await p.evaluate(() => {
    const a = window.__peaks;
    const out = { checks: [] };
    const say = (name, pass, extra) => out.checks.push({ name, pass: !!pass, extra });

    const mesh = a.altSurface;
    const uv = mesh.geometry.getAttribute('uv');
    const col = mesh.geometry.getAttribute('color');
    const u0 = (a.state.umin + a.state.umax) / 2;
    const period = a.state.umax - a.state.umin;

    // colour at the vertex nearest a given u-phase
    const colourNear = (uTarget) => {
      let best = -1, bd = Infinity;
      for (let i = 0; i < uv.count; i++) {
        let d = Math.abs(uv.getX(i) - uTarget);
        d = Math.min(d, period - d);
        if (d < bd) { bd = d; best = i; }
      }
      return [col.getX(best), col.getY(best), col.getZ(best)];
    };

    const start = colourNear(u0);
    const far = colourNear(u0 + period / 2);
    const seamA = colourNear(a.state.umin + 1e-4);
    const seamB = colourNear(a.state.umax - 1e-4);
    say('white at the default start', start[0] > 0.9 && start[1] > 0.9 && start[2] > 0.9, start.map(v=>v.toFixed(2)).join(','));
    say('deepest blue at the far side', far[2] > 0.4 && far[0] < 0.15 && far[1] < 0.25, far.map(v=>v.toFixed(2)).join(','));
    say('continuous over the seam', Math.abs(seamA[2] - seamB[2]) < 0.05,
      `${seamA[2].toFixed(2)} vs ${seamB[2].toFixed(2)}`);

    // the explorer's default start really is the white pole of the ramp
    say('walker starts at u0, mid-width',
      Math.abs(a.walker.u - u0) < 1e-9 && Math.abs(a.walker.v - (a.state.vmin + a.state.vmax) / 2) < 1e-9,
      `u=${a.walker.u.toFixed(3)} v=${a.walker.v.toFixed(3)}`);

    // the flag
    const flag = a.world.getObjectByName('mobius-flag');
    say('flag exists', !!flag);
    if (flag) {
      const meshes = [];
      flag.traverse((o) => { if (o.isMesh) meshes.push(o); });
      say('flag has pole + two pennants', meshes.length === 3, `${meshes.length} meshes`);
      const cols = meshes.filter((m) => m.geometry.getAttribute('position').count === 3)
        .map((m) => [m.material.color.r, m.material.color.g, m.material.color.b]);
      const hasBlue = cols.some((c) => c[2] > 0.4 && c[0] < 0.15);
      const hasWhite = cols.some((c) => c[0] > 0.9 && c[1] > 0.9);
      say('one blue and one white pennant', hasBlue && hasWhite, JSON.stringify(cols.map(c=>c.map(v=>v.toFixed(2)))));

      // the flag stands at r(u0, v-middle)
      const P = a.walker.at((a.state.umin + a.state.umax) / 2, (a.state.vmin + a.state.vmax) / 2, new a.THREE.Vector3());
      say('flag planted at the start point', flag.position.distanceTo(P) < 1e-6,
        flag.position.distanceTo(P).toExponential(1));

      // the two pennants sit on opposite sides of the surface: their local y
      // extents have opposite signs
      const ys = meshes.filter((m) => m.geometry.getAttribute('position').count === 3)
        .map((m) => m.geometry.getAttribute('position').getY(0));
      say('pennants on opposite ends of the pole', ys.length === 2 && ys[0] * ys[1] < 0,
        ys.map((y) => y.toFixed(2)).join(','));
    }
    return out;
  });

  // height-ramp toggle overrides, and coming back restores the gradient
  await p.evaluate(() => document.getElementById('t-heightcol').click());
  await p.waitForTimeout(600);
  const ramp = await p.evaluate(() => {
    const a = window.__peaks;
    const col = a.altSurface.geometry.getAttribute('color');
    // under the ramp, the u0 region is no longer uniformly white: sample spread
    let lo = 1, hi = 0;
    for (let i = 0; i < col.count; i += 97) { const g = col.getY(i); lo = Math.min(lo, g); hi = Math.max(hi, g); }
    return { spread: +(hi - lo).toFixed(2) };
  });
  await p.evaluate(() => document.getElementById('t-heightcol').click());
  await p.waitForTimeout(600);
  const back = await p.evaluate(() => {
    const a = window.__peaks;
    const uv = a.altSurface.geometry.getAttribute('uv');
    const col = a.altSurface.geometry.getAttribute('color');
    const u0 = (a.state.umin + a.state.umax) / 2;
    let best = -1, bd = Infinity;
    for (let i = 0; i < uv.count; i++) {
      const d = Math.abs(uv.getX(i) - u0);
      if (d < bd) { bd = d; best = i; }
    }
    return { white: col.getX(best) > 0.9 && col.getZ(best) > 0.9 };
  });
  r.checks.push({ name: 'height ramp overrides the gradient', pass: ramp.spread > 0.1, extra: `spread ${ramp.spread}` });
  r.checks.push({ name: 'gradient returns when the ramp is off', pass: back.white });

  // screenshots: the start (blue pennant side) and the far side of the lap
  await p.evaluate(() => document.getElementById('panel-toggle').click());
  await p.waitForTimeout(400);
  await p.screenshot({ path: S + 'mobius-flag.png' });

  // switching to another shape removes the flag
  await p.evaluate(() => document.getElementById('panel-toggle').click());
  await p.waitForTimeout(300);
  await p.selectOption('#sel-shape', 'torus');
  await p.waitForTimeout(1500);
  const gone = await p.evaluate(() => !window.__peaks.world.getObjectByName('mobius-flag'));
  r.checks.push({ name: 'flag removed on leaving the Möbius strip', pass: gone });

  let ok = errs.length === 0;
  for (const c of r.checks) {
    if (!c.pass) ok = false;
    console.log(`${c.pass ? 'ok  ' : 'FAIL'} ${c.name}${c.extra ? '  [' + c.extra + ']' : ''}`);
  }
  console.log('pageerrors:', errs.length ? errs : 'none');
  console.log(ok ? 'ALL GREEN' : 'PROBLEMS');
  await b.close();
  process.exit(ok ? 0 : 1);
})();
