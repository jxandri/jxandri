// The chooser has to govern which key does it, and be remembered.
const { chromium } = require('playwright-core');
let fails = 0;
const check = (n, ok, d) => { if (!ok) fails++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`); };

// Does holding this modifier put the wheel on the explorer's size?
// A cleaner probe than a screenshot: the size dial is a number we can read.
const wheelResizes = async (p, mods) => {
  const before = await p.evaluate(() => document.getElementById('in-zoom').value);
  await p.evaluate((mods) => {
    document.getElementById('view').dispatchEvent(new WheelEvent('wheel', {
      deltaY: 500, deltaMode: 0, bubbles: true, cancelable: true,
      metaKey: !!mods.meta, altKey: !!mods.alt,
    }));
  }, mods);
  await p.waitForTimeout(120);
  const after = await p.evaluate(() => document.getElementById('in-zoom').value);
  if (before !== after) {
    await p.evaluate(() => document.getElementById('btn-charscale-reset').click());
    return true;
  }
  await p.evaluate(() => document.getElementById('btn-camzoom-reset').click());
  return false;
};

const setChoice = async (p, v) => {
  await p.selectOption('#sel-holdkey', v);
  await p.waitForTimeout(200);
};

(async () => {
  const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await b.newContext({ viewport: { width: 1100, height: 800 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('JS: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
  await p.goto('http://127.0.0.1:8125/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(5500);

  check('it defaults to accepting either key',
    (await p.evaluate(() => document.getElementById('sel-holdkey').value)) === 'either');
  check('either: ⌘ works', await wheelResizes(p, { meta: true }));
  check('either: Alt works', await wheelResizes(p, { alt: true }));

  await setChoice(p, 'alt');
  check('Alt only: Alt works', await wheelResizes(p, { alt: true }));
  check('Alt only: ⌘ is left alone', !(await wheelResizes(p, { meta: true })));

  await setChoice(p, 'meta');
  check('⌘ only: ⌘ works', await wheelResizes(p, { meta: true }));
  check('⌘ only: Alt is left alone', !(await wheelResizes(p, { alt: true })));

  // The caveat appears only when it applies.
  await setChoice(p, 'alt');
  const altNote = await p.evaluate(() => document.getElementById('note-holdkey').textContent);
  await setChoice(p, 'meta');
  const metaNote = await p.evaluate(() => document.getElementById('note-holdkey').textContent);
  check('the ⌘+W caveat is shown for ⌘ and not for Alt',
    /closes a tab/.test(metaNote) && !/closes a tab/.test(altNote),
    `alt: "${altNote.slice(0, 40)}…"`);

  // And it survives a reload, in the same browser profile.
  await setChoice(p, 'alt');
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(5500);
  check('the choice is remembered across a reload',
    (await p.evaluate(() => document.getElementById('sel-holdkey').value)) === 'alt');
  check('and is in force after the reload',
    (await wheelResizes(p, { alt: true })) && !(await wheelResizes(p, { meta: true })));

  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(fails === 0 ? '\nTHE HOLD KEY IS A CHOICE, AND IT STICKS' : `\n${fails} FAILURE(S)`);
  process.exit(fails ? 1 : 0);
})();
