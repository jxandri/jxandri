// The explorer must walk in every mode, on the graph and on the mountain,
// with the directional-derivative control on or off.
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage'] });
  const p = await (await b.newContext({viewport:{width:1100,height:760}})).newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto('http://127.0.0.1:8125/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(2200);

  const pos = () => p.evaluate(() => {
    const pl = window.__peaks.player;
    return { x: pl.x, y: pl.y };
  });
  const walk = async () => {
    const a = await pos();
    await p.keyboard.down('w');
    await p.waitForTimeout(1200);
    await p.keyboard.up('w');
    const bp = await pos();
    return Math.hypot(bp.x - a.x, bp.y - a.y);
  };

  let ok = true;
  const say = (name, d) => {
    const pass = d > 1e-4;
    ok = ok && pass;
    console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}: moved ${d.toFixed(4)} math units`);
  };

  // default surface, plain walk (out of the opening drone shot first)
  await p.evaluate(() => document.querySelector('[data-mode="third"]').click());
  await p.waitForTimeout(600);
  say('graph, plain', await walk());

  // directional derivative on — the mode that used to freeze the explorer
  await p.evaluate(() => document.getElementById('t-dir').click());
  await p.waitForTimeout(400);
  say('graph, directional-derivative on', await walk());

  // still on, after wiggling the mouse (which swings u)
  await p.mouse.move(400, 400);
  await p.mouse.move(700, 380);
  await p.waitForTimeout(200);
  say('graph, after swinging u', await walk());

  await p.evaluate(() => document.getElementById('t-dir').click());
  await p.waitForTimeout(300);

  // the mountain
  await p.selectOption('#preset-fn', 'elias(x, y)');
  await p.waitForTimeout(3400);
  // preset opens in drone mode; go back to the explorer
  await p.evaluate(() => document.querySelector('[data-mode="third"]').click());
  await p.waitForTimeout(600);
  say('elias, plain', await walk());

  await p.evaluate(() => document.getElementById('t-dir').click());
  await p.waitForTimeout(400);
  say('elias, directional-derivative on', await walk());

  console.log('pageerrors:', errs.length ? errs : 'none');
  console.log(ok && errs.length === 0 ? 'ALL GREEN' : 'PROBLEMS');
  await b.close();
  process.exit(ok && errs.length === 0 ? 0 : 1);
})();
