/**
 * build-standalone.mjs — bundle the app into one self-contained .html file.
 *
 * The normal app in app/ has no build step, but it is made of ES modules, and a
 * browser refuses to load those from a file:// page. That makes the ordinary
 * folder useless to anyone who just wants to unzip something and double-click
 * it. This produces a single file with the CSS, the JavaScript and three.js all
 * inlined, which opens straight off a hard drive, a USB stick or a shared
 * folder, with no server and no network.
 *
 * Usage:  npm install esbuild && node tools/build-standalone.mjs
 */

import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(root, 'app');
// Both front ends. They share every module, so one esbuild pass serves both;
// only the markup and the extra stylesheet differ. The cross-link between them
// is rewritten to the other *file*, so a teacher who unzips the folder and
// double-clicks either one can still reach the other.
//
// Border Run is not a third file. It lives inside both of these, dormant until
// a border mountain is chosen — which is the whole point of folding it in, and
// means a teacher hands out one file rather than choosing between two.
const PAGES = [
  { src: 'index.html', out: 'Gradient-Peaks.html', extraCss: 'game.css',
    link: ['href="lab.html"', 'href="Gradient-Peaks-Lab.html"'] },
  { src: 'lab.html', out: 'Gradient-Peaks-Lab.html', extraCss: 'game.css,lab.css',
    link: ['href="index.html"', 'href="Gradient-Peaks.html"'] },
];

const result = await build({
  entryPoints: [join(app, 'js', 'main.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  logLevel: 'warning',
});
const script = result.outputFiles[0].text;

const css = await readFile(join(app, 'css', 'style.css'), 'utf8');
const icon = await readFile(join(app, 'icon.svg'), 'utf8');
const iconData = `data:image/svg+xml;base64,${Buffer.from(icon).toString('base64')}`;

for (const page of PAGES) {
  // extraCss is a comma-separated list, in the order the page links them, so a
  // stylesheet that overrides another keeps overriding it once inlined.
  const extra = page.extraCss
    ? (await Promise.all(page.extraCss.split(',')
      .map((f) => readFile(join(app, 'css', f.trim()), 'utf8')))).map((c) => `\n${c}`).join('')
    : '';
  let html = await readFile(join(app, page.src), 'utf8');

  // Swap every external reference for its inlined equivalent.
  //
  // The replacements use functions, not strings: minified JavaScript contains
  // "$&" and "$'" sequences, and String.replace reads those in a *string*
  // replacement as "insert the match" / "insert everything after it". That
  // silently re-injected the very script tag being replaced.
  html = html
    .replace('<link rel="manifest" href="manifest.webmanifest">\n', '')
    .replace('<link rel="apple-touch-icon" href="icon-192.png">\n', '')
    .replace('<link rel="icon" href="icon.svg" type="image/svg+xml">',
      () => `<link rel="icon" href="${iconData}" type="image/svg+xml">`)
    .replace('<link rel="stylesheet" href="css/lab.css">\n', '')
    .replace('<link rel="stylesheet" href="css/game.css">\n', '')
    .replace('<link rel="stylesheet" href="css/style.css">',
      () => `<style>\n${css}${extra}\n</style>`)
    .replace(/<script type="importmap">[\s\S]*?<\/script>\n/, '')
    .replace('<script type="module" src="js/main.js"></script>', () => `<script>\n${script}\n</script>`)
    .replace(page.link[0], () => page.link[1]);

  // Fail loudly rather than shipping a file with a dangling reference.
  for (const bad of ['href="css/', 'src="js/', 'importmap', 'href="manifest',
    'href="lab.html"', 'href="index.html"']) {
    if (html.includes(bad)) throw new Error(`${page.out} still references ${bad}`);
  }

  const out = join(root, 'dist', page.out);
  await writeFile(out, html, 'utf8');
  console.log(`${out}  ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB`);
}
