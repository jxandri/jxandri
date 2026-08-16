// Two independent things, checked in one pass: the crochet-ball preset lands
// the right formula, domain and feasible mask on both apps; and Lab's
// vegetation-matches-explorer toggle actually ties tree size to the zoom dial.
const { chromium } = require('playwright-core');
let fails = 0;
const check = (n, ok, d) => { if (!ok) fails++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`); };

const CROCHET = 'y/(hypot(x,y)+1e-9)*sqrt(2*((1/3)*sinh(hypot(x,y)*sqrt(3))^2-hypot(x,y)^2))';

const forest = (p) => p.evaluate(() => {
  let n = 0, tallest = 0;
  const m = new (window.__peaks.THREE.Matrix4)();
  const s = new (window.__peaks.THREE.Vector3)();
  const q = new (window.__peaks.THREE.Quaternion)();
  const t = new (window.__peaks.THREE.Vector3)();
  window.__peaks.world.traverse((o) => {
    if (!o.isInstancedMesh || o.count === 0) return;
    n += o.count;
    o.getMatrixAt(0, m);
    m.decompose(t, q, s);
    tallest = Math.max(tallest, s.x);
  });
  return { n, tallest };
});

(async () => {
  const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
  });

  for (const page of ['index.html', 'lab.html']) {
    const ctx = await b.newContext({ viewport: { width: 1100, height: 800 } });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push('JS: ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
    await p.goto('http://127.0.0.1:8125/' + page, { waitUntil: 'load' });
    await p.waitForTimeout(2200);

    // --- the crochet preset ---
    await p.selectOption('#preset-fn', CROCHET);
    await p.waitForTimeout(1800);
    const got = await p.evaluate(() => ({
      fn: document.getElementById('in-fn').value,
      feas: document.getElementById('in-feas').value,
      feasOn: document.getElementById('t-feas').checked,
      isolateOn: document.getElementById('t-isolate').checked,
      xmin: parseFloat(document.getElementById('in-xmin').value),
      xmax: parseFloat(document.getElementById('in-xmax').value),
      noteHidden: document.getElementById('note-crochet').hidden,
      err: document.getElementById('err-fn').hidden,
    }));
    const A = 1 / Math.sqrt(3);
    check(`${page}: the crochet formula lands in the box`, got.fn === CROCHET, got.fn);
    check(`${page}: the domain is masked to its disk`,
      got.feasOn && got.isolateOn && /x\^2\+y\^2<=/.test(got.feas), JSON.stringify(got));
    check(`${page}: and the window is a hair wider than the disk`,
      Math.abs(got.xmax - A * 1.08) < 1e-3 && got.xmin === -got.xmax, `xmax ${got.xmax}, a ${A.toFixed(4)}`);
    check(`${page}: the explanatory note is showing`, !got.noteHidden);
    check(`${page}: and it compiled without error`, got.err, 'err-fn should stay hidden');

    // Switching to an unrelated example should hide the note again.
    await p.selectOption('#preset-fn', '1-x^2-y^2');
    await p.waitForTimeout(800);
    check(`${page}: the note goes away for a different formula`,
      await p.evaluate(() => document.getElementById('note-crochet').hidden));

    check(`${page}: no console/page errors`, errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // --- the vegetation-scale toggle, Lab only ---
  {
    const ctx = await b.newContext({ viewport: { width: 1100, height: 800 } });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push('JS: ' + e.message));
    await p.goto('http://127.0.0.1:8125/index.html', { waitUntil: 'load' });
    await p.waitForTimeout(2200);
    check('index.html: no toggle is offered there', await p.evaluate(() => !document.getElementById('t-decormatch')));
    await ctx.close();
  }
  {
    const ctx = await b.newContext({ viewport: { width: 1100, height: 800 } });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push('JS: ' + e.message));
    await p.goto('http://127.0.0.1:8125/lab.html', { waitUntil: 'load' });
    await p.waitForTimeout(2200);

    check('lab: the toggle is there and on by default',
      await p.evaluate(() => document.getElementById('t-decormatch').checked));

    const before = await forest(p);
    check('lab: a forest exists to begin with', before.n > 100 && before.tallest > 0, JSON.stringify(before));

    // Shrink the explorer tenfold with the toggle on: trees should shrink too.
    await p.evaluate(() => document.getElementById('in-zoom').scrollIntoView({ block: 'center' }));
    await p.evaluate(() => {
      const el = document.getElementById('in-zoom');
      el.value = '1';                                 // 10^-1 = a tenth
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await p.waitForTimeout(1800);
    const shrunk = await forest(p);
    check('lab: with the toggle on, shrinking the explorer shrinks the forest',
      Math.abs(shrunk.tallest / before.tallest - 0.1) < 0.02,
      `ratio ${(shrunk.tallest / before.tallest).toFixed(3)}, want ≈0.100`);

    // Reset, turn the toggle off, shrink again: trees must NOT move this time.
    await p.evaluate(() => {
      const el = document.getElementById('in-zoom');
      el.value = '0';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await p.waitForTimeout(1200);
    const reset = await forest(p);
    await p.evaluate(() => document.getElementById('t-decormatch').click());
    await p.waitForTimeout(300);
    await p.evaluate(() => {
      const el = document.getElementById('in-zoom');
      el.value = '1';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await p.waitForTimeout(1800);
    const untied = await forest(p);
    check('lab: with the toggle off, shrinking the explorer leaves the forest alone',
      Math.abs(untied.tallest - reset.tallest) < reset.tallest * 0.02,
      `${reset.tallest.toFixed(3)} → ${untied.tallest.toFixed(3)}`);

    check('lab: no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  await b.close();
  console.log(fails === 0 ? '\nTHE CROCHET BALL AND THE VEGETATION TOGGLE BOTH WORK' : `\n${fails} FAILURE(S)`);
  process.exit(fails ? 1 : 0);
})();
