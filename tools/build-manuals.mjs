#!/usr/bin/env node
/**
 * Builds the applet manuals: ten PDFs, five applets in Spanish and English.
 *
 *   node tools/build-manuals.mjs               all ten
 *   node tools/build-manuals.mjs firm-supply   both editions of one applet
 *   node tools/build-manuals.mjs firm-supply-es
 *
 * Sources live in docs/manual/. Figures come from docs/manual/figs/, which
 * tools/build-manual-figs.mjs writes; if they are missing this refuses to
 * start rather than producing ten PDFs full of grey boxes.
 *
 * Output lands in dist/ under the same names the Gradient Peaks guide already
 * uses: <Applet>-Guide.pdf in English, <Applet>-Guia.pdf in Spanish.
 *
 * Needs pdflatex with texlive-latex-extra, texlive-fonts-extra,
 * texlive-lang-spanish and texlive-plain-generic. On Debian or Ubuntu:
 *
 *   sudo apt-get install -y --no-install-recommends \
 *     texlive-latex-base texlive-latex-recommended texlive-latex-extra \
 *     texlive-fonts-recommended texlive-fonts-extra texlive-lang-spanish \
 *     texlive-plain-generic lmodern
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, mkdir, copyFile, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'docs', 'manual');
const out = join(root, 'dist');

/* The published names. English keeps "Guide", Spanish keeps "Guia" — the same
   pair the Gradient Peaks manual established, so a directory listing sorts the
   two editions of one applet together. */
const TITLES = {
  'consumer-optimum': 'Consumer-Optimum',
  'demand-functions': 'Demand-Functions',
  'nonlinear-budget': 'Nonlinear-Budget',
  'labor-tax':        'Labour-Tax',
  'firm-supply':      'Firm-Supply',
};

const arg = process.argv[2];
/* open-es.tex and friends are \input fragments, not documents; only a file
   that declares a class is something pdflatex can be pointed at. */
const all = [];
for (const f of (await readdir(src)).sort()) {
  if (!/-(es|en)\.tex$/.test(f)) continue;
  const head = (await readFile(join(src, f), 'utf8')).slice(0, 200);
  if (head.includes('\\documentclass')) all.push(f.replace(/\.tex$/, ''));
}

const jobs = !arg ? all
  : all.includes(arg) ? [arg]
  : all.filter(j => j.startsWith(arg + '-'));

if (!jobs.length) {
  console.error(`nothing to build for "${arg}". Known: ${all.join(', ')}`);
  process.exit(1);
}

try { await run('pdflatex', ['--version']); }
catch {
  console.error('pdflatex not found. See the header of this file for the packages to install.');
  process.exit(1);
}

await mkdir(out, { recursive: true });
let failed = 0;

for (const job of jobs) {
  const [, app, lang] = job.match(/^(.*)-(es|en)$/);
  const figs = join(src, 'figs', app, lang);
  if (!existsSync(figs)) {
    console.error(`  ${job}: no figures at docs/manual/figs/${app}/${lang}/ ` +
                  `— run "node tools/build-manual-figs.mjs ${app}" first`);
    failed++; continue;
  }

  process.stdout.write(`  ${job} `);
  /* Twice: the first pass writes the .toc, the second sets it. */
  let log = '';
  for (let pass = 0; pass < 2; pass++) {
    try {
      const r = await run('pdflatex',
        ['-interaction=nonstopmode', '-halt-on-error', job + '.tex'],
        { cwd: src, maxBuffer: 32 << 20 });
      log = r.stdout;
    } catch (e) {
      log = (e.stdout || '') + (e.stderr || '');
      const first = log.split('\n').filter(l => l.startsWith('!'))[0] || 'pdflatex failed';
      console.log(`\n    ${first}`);
      failed++; log = null; break;
    }
    process.stdout.write('.');
  }
  if (log === null) continue;

  const title = TITLES[app] || app;
  const name = `${title}-${lang === 'es' ? 'Guia' : 'Guide'}.pdf`;
  await copyFile(join(src, job + '.pdf'), join(out, name));

  const over = (log.match(/Overfull \\hbox \((\d+(?:\.\d+)?)pt/g) || [])
    .map(m => parseFloat(m.match(/\((\d+(?:\.\d+)?)/)[1]))
    .filter(pt => pt > 10).length;
  console.log(` -> dist/${name}${over ? `  (${over} overfull lines > 10pt)` : ''}`);
}

/* pdflatex leaves half a dozen files per job next to the sources. */
for (const f of await readdir(src)) {
  if (/\.(aux|log|out|toc|pdf)$/.test(f)) await rm(join(src, f), { force: true });
}

console.log(failed ? `\n${failed} manual(s) failed.` : `\n${jobs.length} manual(s) in dist/.`);
process.exit(failed ? 1 : 0);
