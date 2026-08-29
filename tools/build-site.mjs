/**
 * build-site.mjs — assemble the whole site as plain files, ready to upload.
 *
 * The GitHub Pages workflow already knows how to lay these applets out as one
 * website. This does exactly the same assembly on a laptop and puts a .zip
 * beside it, so the site can be dropped into any ordinary web host — GoDaddy,
 * Hostinger, a university server — by a person with a browser and no command
 * line. Nothing here is specific to a host: the output is static files.
 *
 * Two things make that safe to hand over:
 *
 *   Everything inside is relative. No page refers to a domain, an absolute
 *   path, or a folder above itself, so the whole tree can sit at the root of a
 *   site, in a subfolder, or in a subfolder of a subfolder, and every link,
 *   stylesheet, module and service-worker scope still resolves. That is why
 *   the zip wraps the site in one folder by default: extracting it cannot
 *   overwrite a homepage that is already there.
 *
 *   Nothing is fetched at run time. The elevation models, the land cover, the
 *   building footprints and the photographs are all baked into the JavaScript,
 *   so the site works on a host with no database, no build step and no
 *   outbound network.
 *
 * Usage:
 *   node tools/build-site.mjs                 -> dist/site/apps/…  + dist/jxandri-apps.zip
 *   node tools/build-site.mjs --at-root       -> dist/site/…       + dist/jxandri-root.zip
 *   node tools/build-site.mjs --folder aulas  -> same, under aulas/
 */

import { cp, mkdir, rm, writeFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const run = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const atRoot = args.includes('--at-root');
const folderArg = args.indexOf('--folder');
const FOLDER = atRoot ? '' : (folderArg >= 0 ? args[folderArg + 1] : 'apps');

const out = join(root, 'dist', 'site');
const site = FOLDER ? join(out, FOLDER) : out;

await rm(out, { recursive: true, force: true });
await mkdir(site, { recursive: true });

/**
 * The layout, identical to the one the Pages workflow publishes.
 *
 *   /                       the landing page
 *   /gradient-peaks/        the calculus sandbox, Border Run and the campus
 *   /gradient-peaks/guide/  the illustrated manual, English and Spanish
 *   /consumer-optimum/      …and the five GeoGebra applets
 */
const copies = [
  ['landing/index.html', 'index.html'],
  ['app', 'gradient-peaks'],
  ['docs', 'gradient-peaks/guide'],
  ['consumer-optimum/index.html', 'consumer-optimum/index.html'],
  ['demand-functions/index.html', 'demand-functions/index.html'],
  ['nonlinear-budget/index.html', 'nonlinear-budget/index.html'],
  ['labor-tax/index.html', 'labor-tax/index.html'],
  ['firm-supply/index.html', 'firm-supply/index.html'],
  // The one-file builds, offered as downloads: a student can keep a copy that
  // opens off a memory stick with no connection at all.
  ['dist/Gradient-Peaks.html', 'gradient-peaks/Gradient-Peaks-offline.html'],
  ['dist/Gradient-Peaks-Lab.html', 'gradient-peaks/Gradient-Peaks-Lab-offline.html'],
  ['dist/Gradient-Peaks-Guide.pdf', 'gradient-peaks/guide/Gradient-Peaks-Guide.pdf'],
  ['dist/Gradient-Peaks-Guia.pdf', 'gradient-peaks/guide/Gradient-Peaks-Guia.pdf'],
];

for (const [from, to] of copies) {
  const src = join(root, from);
  if (!existsSync(src)) { console.log(`  (skipped, not built yet: ${from})`); continue; }
  const dst = join(site, to);
  await mkdir(dirname(dst), { recursive: true });
  await cp(src, dst, { recursive: true });
}

// The guide is served as a folder, so its entry point has to be index.html.
const guide = join(site, 'gradient-peaks', 'guide');
if (existsSync(join(guide, 'guide.html'))) {
  await cp(join(guide, 'guide.html'), join(guide, 'index.html'));
  await rm(join(guide, 'guide.html'));
}

/**
 * One .htaccess, and only for the things a default Apache gets wrong.
 *
 * Deliberately small. Every directive is wrapped in an IfModule test, so on a
 * server missing the module the file is inert rather than fatal — a broken
 * .htaccess returns 500 for the whole folder, which is the classic way to take
 * a site down while trying to configure it. There is no HTTPS redirect here on
 * purpose: hosts offer a switch for that, and a hand-written rewrite behind a
 * proxy that terminates TLS is how redirect loops happen.
 */
await writeFile(join(site, '.htaccess'), `# Gradient Peaks and the applets — server settings.
# Safe to delete: the site works without it, it only tidies two details.

# Apache does not know this extension, and without it the browser will not
# treat the app as installable.
<IfModule mod_mime.c>
  AddType application/manifest+json .webmanifest
  AddType image/svg+xml            .svg
</IfModule>

# The offline cache must be allowed to notice a new version of itself.
<IfModule mod_headers.c>
  <FilesMatch "sw\\.js$">
    Header set Cache-Control "no-cache, max-age=0"
  </FilesMatch>
</IfModule>
`, 'utf8');

/* ---------------------------------------------------------------- report */

async function walk(dir) {
  let files = 0, bytes = 0;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { const r = await walk(p); files += r.files; bytes += r.bytes; }
    else { files++; bytes += (await stat(p)).size; }
  }
  return { files, bytes };
}

const tally = await walk(out);
const mb = (b) => `${(b / 1048576).toFixed(1)} MB`;

const zipName = FOLDER ? `jxandri-${FOLDER}.zip` : 'jxandri-root.zip';
const zipPath = join(root, 'dist', zipName);
await rm(zipPath, { force: true });
// -r recurse, -q quiet, -X drop the extra file attributes some unzippers trip
// over. Zipped from inside dist/site so the archive has no leading path.
await run('zip', ['-rqX', zipPath, '.'], { cwd: out, maxBuffer: 1 << 26 });
const zipped = (await stat(zipPath)).size;

console.log(`\n${out}`);
console.log(`  ${tally.files} files, ${mb(tally.bytes)}`);
console.log(`  entry point: ${FOLDER ? `${FOLDER}/index.html` : 'index.html'}`);
console.log(`${zipPath}\n  ${mb(zipped)} — extract this inside public_html`);
