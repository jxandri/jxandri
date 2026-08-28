/**
 * check-game.js — Border Run plays, and it plays with a controller.
 *
 * A synthetic standard-mapping gamepad is installed before the page loads, so
 * the whole game is driven the way a student drives it: D-pad to choose, A to
 * confirm, sticks to walk, A to plant. What is left untested is the hardware
 * handshake, which belongs to the browser.
 *
 * The assertions are about the lesson as much as the interface. A game that
 * awards a medal for standing in the wrong country, or that accepts a flag
 * planted across the frontier, would be teaching the opposite of the thing it
 * exists to teach — so those are the cases with the most tests on them.
 *
 * Serve app/ on 8125 first.
 */
const { chromium } = require('playwright-core');

let fails = 0;
const check = (n, ok, d) => { if (!ok) fails++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`); };

const FAKE_PAD = `
  window.__pad = {
    id: 'Test Controller (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  };
  navigator.getGamepads = () => [window.__pad, null, null, null];
`;

const BTN = { A: 0, B: 1, X: 2, Y: 3, START: 9, UP: 12, DOWN: 13 };

const tap = async (p, i) => {
  await p.evaluate((i) => { window.__pad.buttons[i] = { pressed: true, value: 1 }; }, i);
  await p.waitForTimeout(120);
  await p.evaluate((i) => { window.__pad.buttons[i] = { pressed: false, value: 0 }; }, i);
  await p.waitForTimeout(200);
};

const screen = (p) => p.evaluate(() => document.body.dataset.screen);

/** Put the explorer a given signed distance from the frontier, in km. */
const standAt = (p, g) => p.evaluate((g) => {
  const a = window.__peaks, L = a.game.mission.line;
  a.player.x = L.nx * (L.c + g);
  a.player.y = L.ny * (L.c + g);
}, g);

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await b.newContext({ viewport: { width: 1200, height: 820 }, serviceWorkers: 'block' });
  await ctx.addInitScript(FAKE_PAD);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('JS: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

  await p.goto('http://127.0.0.1:8125/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(3000);

  /* ------------------------------------------- one program, not two pages */

  // The game ships inside the sandbox and stays out of its way until asked.
  const idle = await p.evaluate(() => ({
    screen: document.body.dataset.screen,
    overlay: getComputedStyle(document.getElementById('game')).display,
    panel: getComputedStyle(document.getElementById('panel')).display,
    hud: getComputedStyle(document.getElementById('hud-top')).display,
  }));
  check('the sandbox opens as the sandbox, with the game dormant',
    idle.screen === 'off' && idle.overlay === 'none'
      && idle.panel !== 'none' && idle.hud !== 'none',
    `${idle.screen}, overlay ${idle.overlay}`);

  // Choosing a border mountain from the ordinary examples list is what wakes
  // it: no separate page, no mode switch the student has to know about.
  await p.evaluate(() => {
    const sel = document.getElementById('preset-fn');
    sel.value = 'tomyhoi(x, y)';
    sel.dispatchEvent(new Event('change'));
  });
  await p.waitForTimeout(6000);
  const offered = await p.evaluate(() => ({
    screen: document.body.dataset.screen,
    name: document.getElementById('g-offer-name').textContent,
    text: document.getElementById('g-offer-text').textContent,
    panel: getComputedStyle(document.getElementById('panel')).display,
  }));
  check('choosing a mountain offers the run, without taking the sandbox away',
    offered.screen === 'offer' && /Tomyhoi/.test(offered.name) && offered.panel !== 'none',
    offered.name);

  // ...and declining it leaves the sandbox exactly as it was, on the mountain.
  await tap(p, BTN.B);
  const declined = await p.evaluate(() => ({
    screen: document.body.dataset.screen,
    fn: document.getElementById('in-fn').value,
    panel: getComputedStyle(document.getElementById('panel')).display,
    contours: !!document.getElementById('t-contours'),
  }));
  check('declining leaves the mountain loaded and every control in place',
    declined.screen === 'off' && declined.fn === 'tomyhoi(x, y)'
      && declined.panel !== 'none' && declined.contours,
    declined.fn);

  /* ------------------------------------------------------------- the menu */

  await tap(p, BTN.START);            // the pad route into the mission list
  await p.waitForTimeout(300);

  const menu = await p.evaluate(() => ({
    screen: document.body.dataset.screen,
    rows: document.querySelectorAll('.g-row').length,
    on: document.querySelector('.g-row.on .g-name')?.textContent,
    photo: (document.getElementById('g-preview').src || '').length > 500,
    blurb: (document.getElementById('g-blurb').textContent || '').length > 40,
    sandboxHidden: getComputedStyle(document.getElementById('hud-top')).display === 'none',
  }));
  check('the game opens on a mission list of twelve', menu.screen === 'menu' && menu.rows === 12,
    `${menu.rows} mountains`);
  check('each mission shows its photograph and description', menu.photo && menu.blurb);
  check('the sandbox chrome stays out of the way', menu.sandboxHidden);

  await tap(p, BTN.DOWN);
  await tap(p, BTN.DOWN);
  const moved = await p.evaluate(() => document.querySelector('.g-row.on .g-name').textContent);
  check('the D-pad moves the selection', moved !== menu.on, `${menu.on} -> ${moved}`);
  await tap(p, BTN.UP);
  const back = await p.evaluate(() => document.querySelector('.g-row.on .g-name').textContent);
  check('and moves it back', back !== moved);

  /* ---------------------------------------------------------- the briefing */

  await tap(p, BTN.A);
  await p.waitForTimeout(400);
  const brief = await p.evaluate(() => ({
    screen: document.body.dataset.screen,
    name: document.getElementById('g-brief-name').textContent,
    text: document.getElementById('g-brief-text').textContent,
  }));
  check('A opens the briefing', brief.screen === 'brief', brief.name);
  const mission = await p.evaluate(() => {
    // the mission the game means, straight from its own state
    const m = window.__peaks.game.mission;
    return { own: m.countries[0], other: m.countries[1], line: m.boundary,
      summit: Math.round(m.summitMetres), best: Math.round(m.constrained.metres) };
  });
  check('the briefing puts the player in the country without the summit',
    brief.text.includes(mission.other.split(' (')[0]) && brief.text.includes(mission.line),
    `${mission.other.split(' (')[0]}, ${mission.line}`);

  /* -------------------------------------------------------------- the run */

  await tap(p, BTN.A);
  await p.waitForTimeout(5000);
  const drop = await p.evaluate(() => {
    const a = window.__peaks, L = a.game.mission.line;
    const g = L.nx * a.player.x + L.ny * a.player.y - L.c;
    return { screen: document.body.dataset.screen, g,
      inWindow: Math.abs(a.player.x) <= a.state.xmax && Math.abs(a.player.y) <= a.state.ymax,
      legal: document.getElementById('g-side').dataset.legal,
      alt: document.getElementById('g-alt').textContent };
  });
  check('A drops the player into the run', drop.screen === 'run');
  check('the drop lands inside the feasible country and inside the window',
    drop.g < 0 && drop.inWindow && drop.legal === 'yes',
    `${Math.abs(drop.g).toFixed(2)} km inside, altitude ${drop.alt}`);

  // The stick walks. This is the same path the sandbox uses, but it has to keep
  // working while the game layer is on top of it.
  const before = await p.evaluate(() => ({ x: window.__peaks.player.x, y: window.__peaks.player.y }));
  await p.evaluate(() => { window.__pad.axes = [0, -1, 0, 0]; });
  await p.waitForTimeout(900);
  await p.evaluate(() => { window.__pad.axes = [0, 0, 0, 0]; });
  const after = await p.evaluate(() => ({ x: window.__peaks.player.x, y: window.__peaks.player.y }));
  check('the left stick walks during a run',
    Math.hypot(after.x - before.x, after.y - before.y) > 1e-3,
    `${Math.hypot(after.x - before.x, after.y - before.y).toFixed(3)} km`);

  /* --------------------------------------- the constraint, felt not stated */

  await standAt(p, 1.0);                     // a kilometre over the frontier
  await p.waitForTimeout(400);
  await tap(p, BTN.A);
  const trespass = await p.evaluate(() => ({
    screen: document.body.dataset.screen,
    warned: !document.getElementById('g-warn').hidden,
    text: document.getElementById('g-warn').textContent,
    legal: document.getElementById('g-side').dataset.legal,
  }));
  check('crossing the frontier is allowed — the mountain is still walkable',
    trespass.screen === 'run' && trespass.legal === 'no');
  check('but a flag planted across it is refused, by name',
    trespass.warned && trespass.text.includes(mission.own.split(' (')[0]),
    trespass.text.slice(0, 64));

  /* ------------------------------------------------- planting, and scoring */

  // Stand on the true constrained maximum and plant: this must be a gold.
  await p.evaluate(() => {
    const a = window.__peaks, c = a.game.mission.constrained;
    a.player.x = c.x; a.player.y = c.y;
  });
  await p.waitForTimeout(500);
  await tap(p, BTN.A);
  await p.waitForTimeout(2500);
  const result = await p.evaluate(() => ({
    screen: document.body.dataset.screen,
    tier: document.getElementById('g-medal').dataset.tier,
    numbers: document.getElementById('g-numbers').textContent,
    lesson: document.getElementById('g-lesson').textContent,
    optimum: !!window.__peaks.optimum,
    gap: window.__peaks.game.planted.gap,
  }));
  check('planting on the constrained maximum scores gold',
    result.screen === 'result' && result.tier === 'gold' && result.gap < 10,
    `${result.gap.toFixed(0)} m off the best`);
  check('the answer is only revealed after the flag is planted', result.optimum);
  check('the result states the lesson in the mountain\'s own numbers',
    result.lesson.includes(mission.line)
      && result.lesson.includes(String(mission.summit))
      && result.lesson.includes(String(mission.best)),
    `${mission.summit} m summit, ${mission.best} m best, on ${mission.line}`);

  const stars = await p.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('border-run') || '{}'); } catch { return null; }
  });
  const id = await p.evaluate(() => window.__peaks.game.mission.id);
  check('the medal is remembered', stars && stars[id] && stars[id].stars === 3,
    JSON.stringify(stars && stars[id]));

  /* ----------------------------------------------------------- and around */

  await tap(p, BTN.X);
  await p.waitForTimeout(500);
  const home = await p.evaluate(() => ({
    screen: document.body.dataset.screen,
    stars: document.querySelector('.g-row.on .g-stars')?.textContent,
  }));
  check('X returns to the mission list, with the medal shown',
    home.screen === 'menu' && home.stars === '★★★', home.stars);

  // And out again: the run is over, the answer is marked, and the mountain is
  // handed back to the sandbox with all of its instruments.
  await tap(p, BTN.B);
  await p.waitForTimeout(400);
  const backToLab = await p.evaluate(() => ({
    screen: document.body.dataset.screen,
    panel: getComputedStyle(document.getElementById('panel')).display,
    hud: getComputedStyle(document.getElementById('hud-top')).display,
    optimum: !!window.__peaks.optimum,
  }));
  check('leaving the game gives the sandbox back, answer and all',
    backToLab.screen === 'off' && backToLab.panel !== 'none'
      && backToLab.hud !== 'none' && backToLab.optimum);

  check('no page errors anywhere in a full round', errs.length === 0, errs.slice(0, 2).join(' | '));

  console.log(fails === 0
    ? '\nBORDER RUN IS PLAYABLE, AND THE FRONTIER IS THE RULE'
    : `\n${fails} FAILURE(S)`);
  await b.close();
  process.exit(fails ? 1 : 0);
})();
