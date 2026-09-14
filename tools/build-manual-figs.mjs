#!/usr/bin/env node
/**
 * Screenshots for the applet manuals.
 *
 * Every figure is captured twice, once with the applet in Spanish and once in
 * English, because a manual whose screenshots are in the other language is a
 * manual the reader has to translate while reading it. The Gradient Peaks guide
 * already works that way; these follow it.
 *
 * Figures are taken in the light theme. They are going onto white paper, and a
 * dark screenshot printed on white is a black rectangle. The one exception is
 * the deliberate `dark` figure in each set, which is there to show the reader
 * what the toggle does.
 *
 *   node tools/build-manual-figs.mjs            all applets, both languages
 *   node tools/build-manual-figs.mjs firm-supply
 *   node tools/build-manual-figs.mjs firm-supply es
 *
 * Output: docs/manual/figs/<applet>/<lang>/<name>.png
 */
import { chromium } from 'playwright-core';
import { mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium';

/* A figure is: a name, a list of expressions run in the page, and what to clip
   to. `page` means the whole document; anything else is a CSS selector whose
   bounding box is captured. Steps run in order and each is awaited. */
const VIEWPORTS = '.viewports';
const LEFT  = '.viewports > *:nth-child(1)';
const RIGHT = '.viewports > *:nth-child(2)';

const APPS = {

  'consumer-optimum': {
    /* No theme button: this one follows the operating system, so the context
       carries the colour scheme instead. */
    theme: 'context',
    lang: { es: '#lang-es', en: '#lang-en' },
    figs: [
      { name: 'interface', clip: 'page' },
      { name: 'panels',    clip: VIEWPORTS },
      { name: 'xz',        clip: RIGHT,
        steps: ['document.querySelector("[data-view=xz]").click()'] },
      { name: 'xy',        clip: RIGHT,
        steps: ['document.querySelector("[data-view=xy]").click()'] },
      { name: 'optimum',   clip: VIEWPORTS,
        steps: ['st.layers.optimum=true; st.layers.tangent=true; render()'] },
      { name: 'complements', clip: VIEWPORTS,
        steps: ['pickPreset("min(2x,y)")', 'st.layers.optimum=true; render()'] },
      { name: 'substitutes', clip: VIEWPORTS,
        steps: ['pickPreset("2x+3y")', 'st.layers.optimum=true; render()'] },
      { name: 'challenge', clip: 'page',
        steps: ['document.getElementById("mode-challenge").click()'] },
      { name: 'dark',      clip: VIEWPORTS, dark: true },
    ],
  },

  'demand-functions': {
    theme: { light: '#th-light', dark: '#th-dark' },
    lang: { es: '#lg-es', en: '#lg-en' },
    figs: [
      { name: 'interface', clip: 'page' },
      { name: 'panels',    clip: VIEWPORTS },
      { name: 'swept',     clip: VIEWPORTS, steps: ['sweepFor(1400)'] },
      { name: 'revealed',  clip: VIEWPORTS,
        steps: ['sweepFor(1400)', 'st.layers.curve=true; st.layers.pcc=true; buildLayers(); render()'] },
      { name: 'engel',     clip: VIEWPORTS,
        steps: ['document.querySelector("#axis-seg [data-axis=I]").click()', 'sweepFor(1400)'] },
      { name: 'giffen',    clip: VIEWPORTS,
        steps: ['document.querySelector("[data-fam=inf]").click()',
                'setSlider("minPy",0.2)', 'setSlider("py",0.35)',
                'sweepFor(1600)',
                'st.layers.curve=true; st.layers.giffen=true; st.layers.dy=false; buildLayers(); render()',
                'var fa=document.getElementById("fixed-axis"); fa.checked=false; fa.dispatchEvent(new Event("change",{bubbles:true}))'] },
      { name: 'giffen-verdict', clip: '#verdict',
        steps: ['document.querySelector("[data-fam=inf]").click()',
                'setSlider("minPy",0.2)', 'setSlider("py",0.35)',
                'setSlider("px",1.83)'] },
      { name: 'dark',      clip: VIEWPORTS, dark: true },
    ],
  },

  'nonlinear-budget': {
    theme: { light: '#th-light', dark: '#th-dark' },
    lang: { es: '#lg-es', en: '#lg-en' },
    figs: [
      { name: 'interface', clip: 'page' },
      { name: 'simple',    clip: VIEWPORTS,
        steps: ['pickScheme("simple")'] },
      { name: 'kink',      clip: VIEWPORTS,
        steps: ['pickScheme("kind")'] },
      { name: 'drop',      clip: VIEWPORTS,
        steps: ['pickScheme("excl")'] },
      { name: 'drop-path', clip: RIGHT,
        steps: ['pickScheme("excl")'] },
      { name: 'compare',   clip: LEFT,
        steps: ['pickScheme("kind")', 'pickCompare("cash")'] },
      { name: 'complements', clip: VIEWPORTS,
        steps: ['pickScheme("kind")', 'document.querySelector("[data-fam=com]").click()'] },
      { name: 'dark',      clip: VIEWPORTS, dark: true, steps: ['pickScheme("excl")'] },
    ],
  },

  'labor-tax': {
    theme: { light: '#th-light', dark: '#th-dark' },
    lang: { es: '#lg-es', en: '#lg-en' },
    figs: [
      { name: 'interface', clip: 'page' },
      { name: 'marginal',  clip: VIEWPORTS,
        steps: ['document.querySelector("[data-m=marginal]").click()'] },
      { name: 'average',   clip: VIEWPORTS,
        steps: ['document.querySelector("[data-m=average]").click()'] },
      { name: 'notch',     clip: RIGHT,
        steps: ['document.querySelector("[data-m=average]").click()'] },
      { name: 'utility',   clip: RIGHT,
        steps: ['document.querySelector("[data-m=average]").click()',
                'document.querySelector("[data-p2=util]").click()'] },
      { name: 'kink-verdict', clip: '#verdict',
        steps: ['document.querySelector("[data-m=marginal]").click()'] },
      { name: 'labour-axis', clip: LEFT,
        steps: ['document.querySelector("[data-axis=labor]").click()'] },
      { name: 'dark',      clip: VIEWPORTS, dark: true,
        steps: ['document.querySelector("[data-m=average]").click()'] },
    ],
  },

  'firm-supply': {
    theme: { light: '#th-light', dark: '#th-dark' },
    lang: { es: '#lg-es', en: '#lg-en' },
    figs: [
      { name: 'interface', clip: 'page' },
      { name: 'panels',    clip: VIEWPORTS },
      { name: 'cubic',     clip: VIEWPORTS,
        steps: ['document.querySelector("[data-fam=custom]").click()', 'setPrice(1.6)'] },
      { name: 'areas',     clip: VIEWPORTS,
        steps: ['document.querySelector("[data-fam=custom]").click()', 'setPrice(1.6)',
                'st.layers.areaVC=true; st.layers.areaPS=true; buildLayers(); render()'] },
      { name: 'shutdown',  clip: VIEWPORTS,
        steps: ['document.querySelector("[data-fam=custom]").click()', 'setPrice(1.15)'] },
      /* the supply panel is the right-hand one here, as in the GeoGebra original */
      { name: 'jump',      clip: RIGHT,
        steps: ['document.querySelector("[data-fam=custom]").click()', 'setPrice(1.45)',
                'st.layers.areaPS=true; buildLayers(); render()'] },
      { name: 'totals',    clip: VIEWPORTS,
        steps: ['document.querySelector("[data-fam=custom]").click()', 'setPrice(1.6)',
                'document.querySelector("[data-v=tot]").click()',
                'st.layers.beq=true; buildLayers(); render()'] },
      { name: 'capacity',  clip: VIEWPORTS,
        steps: ['document.querySelector("[data-fam=logit]").click()', 'setPrice(3.2)'] },
      { name: 'no-optimum', clip: '#verdict',
        steps: ['document.querySelector("[data-fam=cd]").click()',
                'setSlider("beta",0.05); setSlider("s",2)'] },
      { name: 'dark',      clip: VIEWPORTS, dark: true,
        steps: ['document.querySelector("[data-fam=custom]").click()', 'setPrice(1.6)'] },
    ],
  },
};

/* Helpers injected into every page. The applets are classic scripts, so their
   top-level `st` and `render` are reachable from an evaluated expression; these
   just spare each figure spec from repeating the same three lines. */
const PRELUDE = `
window.setSlider = (id, v) => {
  const el = document.getElementById(id);
  if(!el) throw new Error('no slider ' + id);
  el.value = v;
  el.dispatchEvent(new Event('input',  {bubbles:true}));
  el.dispatchEvent(new Event('change', {bubbles:true}));
};
window.setExpr = (src) => {
  const el = document.getElementById('u-expr') || document.getElementById('c-expr');
  if(!el) throw new Error('no expression box');
  el.value = src;
  el.dispatchEvent(new Event('input', {bubbles:true}));
  el.dispatchEvent(new Event('change', {bubbles:true}));
};
window.pickPreset  = (e) => document.querySelector('[data-expr="'+e+'"]').click();
window.pickScheme  = (k) => document.querySelector('[data-sc="'+k+'"]').click();
window.pickCompare = (k) => document.querySelector('[data-cmp="'+k+'"]').click();
/* The demand applet discovers its curve by moving a slider and leaving marks;
   a figure of it needs that sweep to have happened. */
window.sweepFor = (ms) => new Promise(res => {
  const btn = document.getElementById('btn-sweep') ||
              document.querySelector('#discover button[data-act="sweep"]');
  if(btn){ btn.click(); setTimeout(() => { btn.click(); res(); }, ms); }
  else res();
});
`;

async function shoot(app, lang, fig, cfg) {
  const dir = join(root, 'docs', 'manual', 'figs', app, lang);
  await mkdir(dir, { recursive: true });
  const dark = !!fig.dark;

  const ctx = await BROWSER.newContext({
    viewport: { width: 1500, height: 980 },
    deviceScaleFactor: 2,
    colorScheme: cfg.theme === 'context' ? (dark ? 'dark' : 'light') : 'light',
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));

  await page.goto('file://' + join(root, app, 'index.html'));
  await page.waitForTimeout(500);
  await page.evaluate(PRELUDE);

  /* Language and theme first: both re-render, and both must be settled before
     the figure's own steps run. */
  await page.click(cfg.lang[lang]);
  if (cfg.theme !== 'context') await page.click(cfg.theme[dark ? 'dark' : 'light']);
  await page.waitForTimeout(250);

  for (const s of fig.steps || []) {
    await page.evaluate(s);
    await page.waitForTimeout(160);
  }
  await page.waitForTimeout(450);

  const out = join(dir, fig.name + '.png');
  if (fig.clip === 'page') {
    await page.screenshot({ path: out, fullPage: true });
  } else {
    const el = await page.$(fig.clip);
    if (!el) throw new Error(`${app}/${lang}/${fig.name}: no element ${fig.clip}`);
    await el.screenshot({ path: out });
  }
  await ctx.close();
  if (errs.length) console.log(`    ! ${app}/${lang}/${fig.name}: ${errs[0]}`);
  return out;
}

const only = process.argv[2];
const onlyLang = process.argv[3];
const apps = only ? [only] : Object.keys(APPS);
const langs = onlyLang ? [onlyLang] : ['es', 'en'];

const BROWSER = await chromium.launch({ executablePath: CHROME });
let n = 0;
for (const app of apps) {
  const cfg = APPS[app];
  if (!cfg) { console.error(`unknown applet: ${app}`); process.exit(1); }
  for (const lang of langs) {
    if (!only) await rm(join(root, 'docs', 'manual', 'figs', app, lang), { recursive: true, force: true });
    process.stdout.write(`  ${app} [${lang}] `);
    for (const fig of cfg.figs) { await shoot(app, lang, fig, cfg); process.stdout.write('.'); n++; }
    process.stdout.write('\n');
  }
}
await BROWSER.close();

/* A screenshot of a flat interface quantises to a 256-colour palette with no
   visible loss and about a third of the bytes, which matters because these end
   up embedded in ten PDFs that live in the repository. Optional: without
   pngquant the figures are simply larger and everything still builds. */
let quantised = 0;
try {
  execFileSync('pngquant', ['--version'], { stdio: 'ignore' });
  for (const app of apps) for (const lang of langs) {
    const dir = join(root, 'docs', 'manual', 'figs', app, lang);
    for (const fig of APPS[app].figs) {
      const f = join(dir, fig.name + '.png');
      try {
        execFileSync('pngquant', ['--quality=70-95', '--speed', '1', '--force', '--output', f, f]);
        quantised++;
      } catch { /* pngquant exits 99 when it cannot hit the quality floor */ }
    }
  }
} catch {
  console.log('  (pngquant not installed — figures left unquantised, which is fine)');
}

console.log(`\n${n} figures written to docs/manual/figs/` +
            (quantised ? ` (${quantised} quantised)` : ''));
