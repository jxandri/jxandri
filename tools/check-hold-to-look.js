// Hold-to-look must be hold-to-look: let go and it stops.
//
// The trap is a macOS behaviour, not a logic error. While Command is held, the
// browser does not deliver keyup for character keys. So a user who holds ⌘,
// taps W, lets go of W and then lets go of ⌘ leaves the program believing W is
// still down — and the moment ⌘ is released, W means "walk". From the outside
// that is indistinguishable from the modifier having been a toggle.
const { chromium } = require('playwright-core');
let fails = 0;
const check = (n, ok, d) => { if (!ok) fails++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`); };

const key = (p, type, code, mods) => p.evaluate(([type, code, mods]) => {
  window.dispatchEvent(new KeyboardEvent(type, {
    code, key: code, bubbles: true, cancelable: true,
    metaKey: !!mods.meta, altKey: !!mods.alt, ctrlKey: !!mods.ctrl,
  }));
}, [type, code, mods]);

const where = (p) => p.evaluate(() => ({
  x: parseFloat(document.getElementById('r-x').textContent),
  y: parseFloat(document.getElementById('r-y').textContent),
}));

(async () => {
  const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push('JS: ' + e.message));
  await p.goto('http://127.0.0.1:8125/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(5500);
  await p.evaluate(() => document.querySelector('.mode[data-mode="third"]').click());
  await p.waitForTimeout(600);
  // A big explorer, so any unwanted walking shows up immediately.
  await p.evaluate(() => {
    const el = document.getElementById('in-charscale');
    el.value = '1.5'; el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.waitForTimeout(600);

  // --- the macOS sequence: keyup for W is never delivered -------------------
  await key(p, 'keydown', 'MetaLeft', { meta: true });
  await key(p, 'keydown', 'KeyW', { meta: true });
  await p.waitForTimeout(700);
  // (the user lets go of W here — macOS sends nothing)
  await key(p, 'keyup', 'MetaLeft', { meta: false });
  await p.waitForTimeout(300);

  const a = await where(p);
  await p.waitForTimeout(2500);
  const c = await where(p);
  const moved = Math.hypot(c.x - a.x, c.y - a.y);
  check('letting go of the modifier stops the explorer dead',
    moved < 1e-6, `walked ${moved.toFixed(4)} after everything was released`);

  // --- and the ordinary sequence still works -------------------------------
  const d0 = await where(p);
  await key(p, 'keydown', 'KeyW', {});
  await p.waitForTimeout(900);
  await key(p, 'keyup', 'KeyW', {});
  await p.waitForTimeout(400);
  const d1 = await where(p);
  check('W alone still walks', Math.hypot(d1.x - d0.x, d1.y - d0.y) > 1e-4,
    `walked ${Math.hypot(d1.x - d0.x, d1.y - d0.y).toFixed(4)}`);
  await p.waitForTimeout(1500);
  const d2 = await where(p);
  check('and stops when W is released',
    Math.hypot(d2.x - d1.x, d2.y - d1.y) < 1e-6,
    `drifted ${Math.hypot(d2.x - d1.x, d2.y - d1.y).toFixed(6)} after release`);

  // --- holding the modifier looks, releasing it stops looking --------------
  // Clip to the middle of the scene. The whole page would also catch the
  // direction indicator fading out of its held-modifier state, which is a
  // change that has nothing to do with whether the view is still turning.
  const shot = (n) => p.screenshot({ path: `hold-${n}.png`,
    clip: { x: 380, y: 120, width: 520, height: 440 } });
  await shot('a');
  await key(p, 'keydown', 'AltLeft', { alt: true });
  await key(p, 'keydown', 'ArrowLeft', { alt: true });
  await p.waitForTimeout(800);
  await key(p, 'keyup', 'ArrowLeft', { alt: true });
  await key(p, 'keyup', 'AltLeft', { alt: false });
  await p.waitForTimeout(300);
  await shot('b');
  await p.waitForTimeout(1500);
  await shot('c');
  const fs = require('fs');
  const [A, B, C] = ['a', 'b', 'c'].map((n) => fs.readFileSync(`hold-${n}.png`).length);
  check('holding the modifier turns the view', Math.abs(B - A) > 1000, `${A} -> ${B}`);
  check('and releasing it stops the turn', Math.abs(C - B) < Math.abs(B - A) / 8,
    `turned by ${Math.abs(B - A)} bytes, then drifted ${Math.abs(C - B)}`);

  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(fails === 0 ? '\nHOLD-TO-LOOK IS HOLD-TO-LOOK' : `\n${fails} FAILURE(S)`);
  process.exit(fails ? 1 : 0);
})();
