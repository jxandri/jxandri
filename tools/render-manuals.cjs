/**
 * render-manuals.cjs — print the two applet manuals to PDF through Chromium.
 *
 * Same approach as render-guides.cjs, and for the same reason: the manuals are
 * ordinary web pages, so printing them keeps the real typography, selectable
 * text and the same figures the web version shows.
 *
 *   npm install playwright-core && node tools/render-manuals.cjs
 */
const { chromium } = require('playwright-core');
const JOBS = [
  ['manual-en.html', 'Microeconomics-Applets-Manual.pdf', 'The Microeconomics Applets — Manual'],
  ['manual-es.html', 'Applets-Microeconomia-Manual.pdf',  'Los Applets de Microeconomía — Manual'],
];
(async () => {
  const b = await chromium.launch({
    executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  let bad = 0;
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
    if (errs.length) bad++;
    console.log(`${errs.length ? 'FAIL' : 'ok  '} ${out}  issues: ${errs.length} ${errs.slice(0,3).join(' | ')}`);
    await page.close();
  }
  await b.close();
  process.exit(bad ? 1 : 0);
})();
