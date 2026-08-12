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
const OUT = join(root, 'dist', 'Gradient-Peaks.html');

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

let html = await readFile(join(app, 'index.html'), 'utf8');

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
  .replace('<link rel="stylesheet" href="css/style.css">', () => `<style>\n${css}\n</style>`)
  .replace(/<script type="importmap">[\s\S]*?<\/script>\n/, '')
  .replace('<script type="module" src="js/main.js"></script>', () => `<script>\n${script}\n</script>`);

// Fail loudly rather than shipping a file with a dangling reference.
for (const bad of ['href="css/', 'src="js/', 'importmap', 'href="manifest']) {
  if (html.includes(bad)) throw new Error(`standalone build still references ${bad}`);
}

await writeFile(OUT, html, 'utf8');
console.log(`${OUT}  ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB`);
