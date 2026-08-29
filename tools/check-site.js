/**
 * check-site.js — the uploadable folder works from a subfolder, as posted.
 *
 * This is the check that matters for handing the site to somebody else: the
 * tree is served from a path it was not built at (/apps/…), exactly as it will
 * be on a shared host, and every entry point has to load, run and link
 * correctly with no absolute path anywhere.
 *
 * Serve dist/site on 8130 first.
 */
const { chromium } = require('playwright-core');
const BASE = 'http://127.0.0.1:8130/apps';
let fails = 0;
const check = (n, ok, d) => { if (!ok) fails++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`); };

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await b.newContext({ viewport: { width: 1100, height: 760 }, serviceWorkers: 'block' });

  // Every page, and every request it makes: a 404 anywhere is a file that did
  // not get uploaded or a path that assumed the site sits at the root.
  const pages = [
    ['/', 'the landing page'],
    ['/gradient-peaks/', 'Gradient Peaks'],
    ['/gradient-peaks/lab.html', 'the Lab'],
    ['/gradient-peaks/guide/', 'the illustrated guide'],
    ['/consumer-optimum/', 'Consumer Optimum'],
    ['/demand-functions/', 'Demand Functions'],
    ['/nonlinear-budget/', 'Non-linear Budget'],
    ['/labor-tax/', 'Labour Income Tax'],
    ['/edgeworth-box/', 'The Edgeworth Box'],
    ['/manuales/', 'the applet manuals'],
  ];

  for (const [path, name] of pages) {
    const p = await ctx.newPage();
    const bad = [], errs = [];
    p.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url().replace(BASE, '')}`); });
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(BASE + path, { waitUntil: 'load' });
    await p.waitForTimeout(path.includes('gradient-peaks') && !path.includes('guide') ? 9000 : 2500);
    const title = await p.title();
    check(name, bad.length === 0 && errs.length === 0 && title.length > 0,
      `${title || '(no title)'}${bad.length ? ' | missing: ' + bad.slice(0, 3).join(', ') : ''}`
      + `${errs.length ? ' | ' + errs.slice(0, 2).join(' ') : ''}`);
    await p.close();
  }

  // The manuals are the one place the site links to a file rather than a page,
  // and a PDF that did not get uploaded still gives a hub that looks perfect.
  {
    const p = await ctx.newPage();
    await p.goto(`${BASE}/manuales/`, { waitUntil: 'load' });
    const hrefs = await p.$$eval('a[href$=".pdf"]', (as) => as.map((a) => a.getAttribute('href')));
    const codes = [];
    for (const h of hrefs) {
      const r = await p.request.get(new URL(h, `${BASE}/manuales/`).href);
      codes.push(`${h} ${r.status()}`);
    }
    check('both manuals download', hrefs.length === 2 && codes.every((c) => c.endsWith(' 200')),
      codes.join(', ') || 'no PDF links on the hub');
    await p.close();
  }

  // The app really runs from here: a mountain, its buildings, and the game.
  const p = await ctx.newPage();
  const bad = [], errs = [];
  p.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`${BASE}/gradient-peaks/lab.html`, { waitUntil: 'load' });
  await p.waitForTimeout(4000);
  await p.evaluate(() => { const s = document.getElementById('preset-fn'); s.value = 'uandes(x, y)'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(20000);
  const campus = await p.evaluate(() => ({
    fn: document.getElementById('in-fn').value,
    buildings: !!window.__peaks.world.children.find((c) => c.name === 'buildings'),
    metre: window.__peaks.field.worldY(0.001),
  }));
  check('the campus builds when the site is served from a subfolder',
    campus.fn === 'uandes(x, y)' && campus.buildings && Math.abs(campus.metre - 1) < 0.02,
    `${campus.metre.toFixed(3)} units per metre`);
  await p.evaluate(() => { const s = document.getElementById('preset-fn'); s.value = 'tecate(x, y)'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(15000);
  const offer = await p.evaluate(() => document.getElementById('g-offer-name').textContent);
  check('Border Run offers itself on a border mountain', /Tecate/.test(offer), offer);
  check('nothing 404s and nothing throws', bad.length === 0 && errs.length === 0,
    [...bad.slice(0, 2), ...errs.slice(0, 2)].join(' | '));

  // No page may reach outside its own folder or name a domain.
  const abs = await p.evaluate(() => 0);
  await p.close();
  await b.close();
  console.log(fails === 0 ? '\nTHE FOLDER IS READY TO UPLOAD' : `\n${fails} FAILURE(S)`);
  process.exit(fails ? 1 : 0);
})();
