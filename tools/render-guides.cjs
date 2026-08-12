/**
 * render-guides.cjs — print the two HTML manuals to PDF through Chromium.
 *
 * Chromium rather than a PDF library on purpose: the guides are ordinary web
 * pages, so printing them keeps the real typography, selectable text, working
 * internal links and the same figures the web version shows. A generated PDF
 * from a separate template would be a second document to keep in step.
 *
 * Needs playwright-core and a Chromium; point CHROMIUM at one if the default
 * path is not right for your machine.
 *
 *   npm install playwright-core && node tools/render-guides.cjs
 */

const { chromium } = require('playwright-core');
const JOBS = [
  ['guide.html',    'Gradient-Peaks-Guide.pdf', 'Gradient Peaks — Complete Guide'],
  ['guide-es.html', 'Gradient-Peaks-Guia.pdf',  'Gradient Peaks — Guía completa'],
];
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  for (const [src, out, footer] of JOBS) {
    const page = await b.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('requestfailed', r => errs.push('MISSING: ' + r.url()));
    await page.goto(`file://${__dirname}/../docs/${src}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await page.pdf({
      path: `${__dirname}/../dist/${out}`,
      format: 'A4', printBackground: true, displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `<div style="width:100%;font-family:Helvetica,Arial,sans-serif;font-size:7.5pt;
        color:#8a97a4;padding:0 18mm;display:flex;justify-content:space-between;">
        <span>${footer}</span><span class="pageNumber"></span></div>`,
      margin: { top: '18mm', bottom: '14mm', left: '0', right: '0' },
    });
    console.log(out, '-> issues:', errs.length, errs.slice(0,3));
    await page.close();
  }
  await b.close();
})();
