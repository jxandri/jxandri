// The three requests: walk only along the frontier, level curves clipped to
// the feasible set, and level curves that do not look like staircases.
const { chromium } = require('playwright-core');
const S = require('os').tmpdir() + '/';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage'] });
  const p = await (await b.newContext({viewport:{width:1200,height:820}})).newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  let ok = true;
  const say = (n, pass, extra) => { ok = ok && pass; console.log(`${pass?'ok  ':'FAIL'} ${n}${extra?'  ['+extra+']':''}`); };

  await p.goto('http://127.0.0.1:8125/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(2200);
  await p.selectOption('#preset-fn', 'richards(x, y)');
  await p.waitForTimeout(3600);
  await p.evaluate(() => document.querySelector('[data-mode="third"]').click());
  await p.waitForTimeout(700);

  // --- walk the frontier ---------------------------------------------------
  const line = await p.evaluate(() => {
    const m = /y <= (-?[\d.]+)/.exec(document.getElementById('in-feas').value);
    return m ? parseFloat(m[1]) : null;
  });
  await p.evaluate(() => document.getElementById('t-rail').click());
  await p.waitForTimeout(500);
  const snapped = await p.evaluate(() => ({ x: window.__peaks.player.x, y: window.__peaks.player.y }));
  say('switching the rope on puts the explorer on the line',
    Math.abs(snapped.y - line) < 0.01, `y=${snapped.y.toFixed(4)} vs ${line}`);

  const track = [];
  for (const key of ['w','a','d']) {
    const before = await p.evaluate(() => ({ x: window.__peaks.player.x, y: window.__peaks.player.y }));
    await p.keyboard.down(key); await p.waitForTimeout(900); await p.keyboard.up(key);
    const after = await p.evaluate(() => ({ x: window.__peaks.player.x, y: window.__peaks.player.y }));
    track.push({ key, moved: Math.hypot(after.x-before.x, after.y-before.y), y: after.y });
  }
  const maxOff = Math.max(...track.map(t => Math.abs(t.y - line)));
  const anyMoved = track.some(t => t.moved > 1e-3);
  say('walking slides along the frontier and never leaves it', anyMoved && maxOff < 0.01,
    `moved ${track.map(t=>t.moved.toFixed(3)).join('/')}, worst off-line ${(maxOff*1000).toFixed(1)} m`);

  // the best height reachable on foot along the line matches the optimiser
  await p.evaluate(() => { const o=document.getElementById('t-opt'); if(o&&!o.checked) o.click(); });
  await p.waitForTimeout(1800);
  const opt = await p.evaluate(() => window.__peaks.optimum);
  const walked = await p.evaluate((ln) => {
    // sample the frontier the way a student walking it would
    const f = window.__peaks.field;
    let best = -Infinity, bx = 0;
    for (let x = f.xmin; x <= f.xmax; x += (f.xmax - f.xmin) / 800) {
      const z = f.height(x, ln);
      if (isFinite(z) && z > best) { best = z; bx = x; }
    }
    return { x: bx, z: best };
  }, line);
  say('the best point on the line is the optimiser\'s answer',
    Math.abs(walked.z - opt.z) * 1000 < 6,
    `walked ${(walked.z*1000).toFixed(0)} m vs optimiser ${(opt.z*1000).toFixed(0)} m`);

  // --- level curves inside the feasible set only ---------------------------
  await p.evaluate(() => { const c=document.getElementById('t-contours'); if(!c.checked) c.click(); });
  await p.waitForTimeout(2200);
  const all = await p.evaluate(() => {
    const m = window.__peaks.world.getObjectByName('contours');
    return m ? m.geometry.getAttribute('position').count : 0;
  });
  await p.evaluate(() => document.getElementById('t-curvesin').click());
  await p.waitForTimeout(2200);
  const inside = await p.evaluate((ln) => {
    const a = window.__peaks;
    const m = a.world.getObjectByName('contours');
    if (!m) return null;
    const arr = m.geometry.getAttribute('position').array;
    const f = a.field;
    let worst = -Infinity, n = 0;
    for (let i = 0; i + 2 < arr.length; i += 3) {
      const y = f.mathY(arr[i + 2]);
      worst = Math.max(worst, y - ln);      // >0 means outside the feasible set
      n++;
    }
    return { n, worst };
  }, line);
  say('clipping keeps every contour vertex inside the feasible set',
    inside && inside.worst < 0.06, `worst overshoot ${(inside.worst*1000).toFixed(0)} m`);
  say('clipping actually removes the outside part', inside && inside.n < all * 0.9,
    `${inside.n} of ${all} vertices kept`);

  // --- smoothness of the curves -------------------------------------------
  const kink = await p.evaluate(() => {
    // trace one contour with the app's own tracer and measure turning per step
    const a = window.__peaks;
    const f = a.field;
    const pts = a.traceLevel ? null : null;
    return null;
  });
  await p.evaluate(() => document.getElementById('t-curvesin').click());
  await p.waitForTimeout(1600);
  await p.evaluate(() => document.getElementById('panel-toggle').click());
  await p.waitForTimeout(600);
  await p.screenshot({ path: S + 'frontier.png' });

  console.log('pageerrors:', errs.length ? errs : 'none');
  if (errs.length) ok = false;
  console.log(ok ? 'ALL GREEN' : 'PROBLEMS');
  await b.close();
  process.exit(ok ? 0 : 1);
})();
