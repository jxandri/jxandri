/* render-manual-pdfs.mjs — print each bilingual manual to two PDFs.
 *
 * A PDF cannot carry a language toggle, so every manual is loaded twice: the
 * page is switched with setLang() and pinned to the light theme (a dark page
 * prints as a black slab), then printed. Same reasoning as render-guides.cjs —
 * printing the real page keeps the typography and the selectable text.
 *
 * Run tools/build-manuals.py first. Needs playwright-core and a Chromium;
 * point CHROMIUM at one if the default path is not right for your machine.
 *
 *   npm install playwright-core && node tools/render-manual-pdfs.mjs
 */
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC  = path.join(ROOT, 'manuales');
const OUT  = path.join(SRC, 'pdf');

const APPS = [
  ['consumer-optimum',    'Optimo-del-Consumidor',           'Consumer-Optimum'],
  ['demand-functions',    'Funciones-de-Demanda',            'Demand-Functions'],
  ['nonlinear-budget',    'Restricciones-No-Lineales',       'Non-Linear-Budget-Constraints'],
  ['labor-tax',           'Impuesto-a-la-Renta-del-Trabajo', 'Labour-Income-Tax'],
  ['income-substitution', 'Efectos-Ingreso-y-Sustitucion',   'Income-and-Substitution-Effects'],
];

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const ctx = await browser.newContext();
let failed = 0;

for(const [slug, esName, enName] of APPS){
  for(const [lang, name] of [['es', esName], ['en', enName]]){
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto('file://' + path.join(SRC, slug + '.html'), { waitUntil: 'load' });
    await page.evaluate(l => { setTheme('light'); setLang(l); }, lang);
    await page.emulateMedia({ media: 'print' });
    await page.waitForTimeout(120);
    const file = path.join(OUT, `${name}-${lang.toUpperCase()}.pdf`);
    await page.pdf({
      path: file, format: 'A4', printBackground: true,
      margin: { top:'19mm', bottom:'19mm', left:'16mm', right:'16mm' },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate:
        '<div style="width:100%;font-family:-apple-system,system-ui,sans-serif;' +
        'font-size:8pt;color:#78878C;padding:0 16mm;display:flex;' +
        'justify-content:space-between">' +
        `<span>${name.replace(/-/g, ' ')} — ${lang === 'es' ? 'manual de uso' : 'user guide'}</span>` +
        '<span class="pageNumber"></span></div>',
    });
    if(errs.length){ console.error('ERROR', slug, lang, errs.join(' | ')); failed++; }
    else console.log(path.relative(ROOT, file), fs.statSync(file).size, 'bytes');
    await page.close();
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
