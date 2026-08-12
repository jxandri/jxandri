/**
 * package.mjs — assemble the folder a teacher actually receives, and zip it.
 *
 * The ZIP used to be put together by hand, which meant that every time a new
 * source file appeared (surfaces.js, most recently) the packaged copy quietly
 * fell a file behind the repository. This walks app/ rather than listing it, so
 * that cannot happen again.
 *
 * Run the standalone build first — this copies dist/Gradient-Peaks.html in, it
 * does not rebuild it:
 *
 *   node tools/build-standalone.mjs
 *   node tools/package.mjs
 */

import { cp, mkdir, rm, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const run = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist', 'package');
const folder = join(out, 'Gradient-Peaks');

/** Everything that has to be in the teacher's folder, and where it comes from. */
const ITEMS = [
  ['dist/Gradient-Peaks.html', 'Gradient-Peaks.html'],
  ['dist/Gradient-Peaks-Guide.pdf', 'Gradient-Peaks-Guide.pdf'],
  ['dist/Gradient-Peaks-Guia.pdf', 'Gradient-Peaks-Guia.pdf'],
  ['dist/README.txt', 'README.txt'],
  ['dist/LEEME.txt', 'LEEME.txt'],
  ['app', 'website'],
  ['tools/build-standalone.mjs', 'tools/build-standalone.mjs'],
];

await rm(out, { recursive: true, force: true });
await mkdir(join(folder, 'tools'), { recursive: true });

const missing = [];
for (const [from, to] of ITEMS) {
  const src = join(root, from);
  if (!existsSync(src)) { missing.push(from); continue; }
  await cp(src, join(folder, to), { recursive: true });
}

// The web app's own housekeeping files mean nothing inside a zip.
await rm(join(folder, 'website', '.nojekyll'), { force: true });

const zip = join(root, 'dist', 'Gradient-Peaks.zip');
await rm(zip, { force: true });
await run('zip', ['-r', '-q', zip, 'Gradient-Peaks'], { cwd: out });

const count = async (dir) => {
  let n = 0;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    n += e.isDirectory() ? await count(join(dir, e.name)) : 1;
  }
  return n;
};

const size = (await stat(zip)).size / 1024 / 1024;
console.log(`${zip}  ${size.toFixed(2)} MB, ${await count(folder)} files`);
if (missing.length) {
  console.log('MISSING (build these first):');
  for (const m of missing) console.log('  ', m);
  process.exitCode = 1;
}
